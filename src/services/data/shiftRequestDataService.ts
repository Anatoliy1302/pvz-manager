import * as SecureStore from 'expo-secure-store';
import {
  fetchShiftRequestsFromSupabase,
  mergeShiftRequests,
  upsertShiftRequestToSupabase,
  updateShiftRequestInSupabase,
} from '../SupabaseShiftRequestService';
import { dataEventBus } from './dataEventBus';
import { ShiftRequest } from './dataTypes';
import { getPvzById } from './pvzDataService';
import { getUsers } from './userDataService';

export async function getAllShiftRequests(): Promise<ShiftRequest[]> {
  const stored = await SecureStore.getItemAsync('all_shift_requests');
  const local: ShiftRequest[] = stored ? JSON.parse(stored) : [];
  const remote = await fetchShiftRequestsFromSupabase();

  if (remote === null) {
    return local;
  }

  if (remote.length === 0) {
    return local;
  }

  const merged = mergeShiftRequests(local, remote);
  await SecureStore.setItemAsync('all_shift_requests', JSON.stringify(merged));
  return merged;
}

export async function getShiftRequestsByEmployee(employeeId: string): Promise<ShiftRequest[]> {
  const all = await getAllShiftRequests();
  return all.filter((r) => r.employeeId === employeeId);
}

export async function addShiftRequest(request: ShiftRequest): Promise<void> {
  const requests = await getAllShiftRequests();
  const existingIndex = requests.findIndex((r) => r.id === request.id);
  if (existingIndex !== -1) {
    requests[existingIndex] = request;
  } else {
    requests.push(request);
  }
  await SecureStore.setItemAsync('all_shift_requests', JSON.stringify(requests));

  const employeeRequests = requests.filter((r) => r.employeeId === request.employeeId);
  await SecureStore.setItemAsync(
    `shift_requests_${request.employeeId}`,
    JSON.stringify(employeeRequests)
  );

  const synced = await upsertShiftRequestToSupabase(request);
  if (synced && synced.id !== request.id) {
    const idx = requests.findIndex((r) => r.id === request.id);
    if (idx !== -1) {
      requests[idx] = { ...requests[idx], id: synced.id, pvzId: synced.pvzId };
      await SecureStore.setItemAsync('all_shift_requests', JSON.stringify(requests));
      const employeeRequests = requests.filter((r) => r.employeeId === request.employeeId);
      await SecureStore.setItemAsync(
        `shift_requests_${request.employeeId}`,
        JSON.stringify(employeeRequests)
      );
    }
  }

  dataEventBus.notify('all_shift_requests');
}

export async function updateShiftRequest(
  id: string,
  updates: Partial<ShiftRequest>
): Promise<void> {
  const requests = await getAllShiftRequests();
  const index = requests.findIndex((r) => r.id === id);

  if (index !== -1) {
    requests[index] = { ...requests[index], ...updates };
    await SecureStore.setItemAsync('all_shift_requests', JSON.stringify(requests));

    const employeeRequests = await getShiftRequestsByEmployee(requests[index].employeeId);
    const empIndex = employeeRequests.findIndex((r) => r.id === id);
    if (empIndex !== -1) {
      employeeRequests[empIndex] = requests[index];
      await SecureStore.setItemAsync(
        `shift_requests_${requests[index].employeeId}`,
        JSON.stringify(employeeRequests)
      );
    }

    await updateShiftRequestInSupabase(id, updates);
    dataEventBus.notify('all_shift_requests');
  }
}

export async function refreshShiftRequestsCache(): Promise<ShiftRequest[]> {
  const stored = await SecureStore.getItemAsync('all_shift_requests');
  const local: ShiftRequest[] = stored ? JSON.parse(stored) : [];
  const remote = await fetchShiftRequestsFromSupabase();

  if (!remote) {
    return local;
  }

  const merged = mergeShiftRequests(local, remote);
  await SecureStore.setItemAsync('all_shift_requests', JSON.stringify(merged));

  const byEmployee = new Map<string, ShiftRequest[]>();
  merged.forEach((request) => {
    const list = byEmployee.get(request.employeeId) || [];
    list.push(request);
    byEmployee.set(request.employeeId, list);
  });

  for (const [employeeId, requests] of byEmployee.entries()) {
    await SecureStore.setItemAsync(`shift_requests_${employeeId}`, JSON.stringify(requests));
    dataEventBus.emitChange(`shift_requests_${employeeId}`);
  }

  dataEventBus.emitChange('all_shift_requests');
  return merged;
}

export async function getShiftRequestNotifyRecipients(
  pvzId: string
): Promise<{ id: string; name: string; role: string }[]> {
  const users = await getUsers();
  const pvz = await getPvzById(pvzId);
  const recipients: { id: string; name: string; role: string }[] = [];
  const seen = new Set<string>();

  if (pvz?.ownerId) {
    const owner = users.find((u) => u.id === pvz.ownerId && u.status === 'active');
    if (owner) {
      recipients.push({ id: owner.id, name: owner.name, role: owner.role });
      seen.add(owner.id);
    }
  }

  users.forEach((u) => {
    if (u.role !== 'admin' || u.status !== 'active' || seen.has(u.id)) return;
    const hasPvz = u.pvzId === pvzId || u.pvzIds?.includes(pvzId);
    if (!hasPvz) return;
    recipients.push({ id: u.id, name: u.name, role: u.role });
    seen.add(u.id);
  });

  return recipients;
}
