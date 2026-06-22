import StorageService from '../StorageService';
import { dataEventBus } from './dataEventBus';
import { getShiftRequestNotifyRecipients } from './shiftRequestDataService';
import * as shiftDataService from './shiftDataService';
import { generateSecureId } from '../../utils/generateSecureId';
import { safeParseJson } from '../../utils/safeJson';
import { syncSwapRequestsToServer } from '../../../lib/syncPersistence';
import {
  getScheduleAssignments,
  saveScheduleAssignments,
} from './scheduleDataService';

export type SwapRequestStatus = 'pending' | 'approved' | 'rejected';

export interface SwapRequest {
  id: string;
  fromEmployeeId: string;
  fromEmployeeName: string;
  toEmployeeId: string;
  toEmployeeName: string;
  fromDate: string;
  toDate: string;
  fromShiftId: string;
  toShiftId: string;
  status: SwapRequestStatus;
  reason: string;
  createdAt: string;
  pvzId?: string;
}

function storageKey(pvzId: string) {
  return `swap_requests_${pvzId}`;
}

function eventKey(pvzId: string) {
  return `swap_requests_${pvzId}`;
}

async function readAll(pvzId: string): Promise<SwapRequest[]> {
  const stored = await StorageService.getItem(storageKey(pvzId));
  return safeParseJson<SwapRequest[]>(stored ?? '[]', []);
}

async function writeAll(pvzId: string, requests: SwapRequest[]): Promise<void> {
  await StorageService.setItem(storageKey(pvzId), JSON.stringify(requests));
  dataEventBus.notify(eventKey(pvzId));
  void syncSwapRequestsToServer(pvzId, requests);
}

export async function getSwapRequestsByPvz(pvzId: string): Promise<SwapRequest[]> {
  const requests = await readAll(pvzId);
  return requests.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function countPendingSwapRequests(pvzId: string | undefined): Promise<number> {
  if (!pvzId) return 0;
  const requests = await readAll(pvzId);
  return requests.filter((r) => r.status === 'pending').length;
}

export async function loadSwapRequestsForUser(
  pvzId: string | undefined,
  userId: string | undefined
): Promise<{ pending: SwapRequest[]; history: SwapRequest[] }> {
  if (!pvzId || !userId) {
    return { pending: [], history: [] };
  }

  const requests = await readAll(pvzId);
  const mine = requests.filter(
    (r) => r.fromEmployeeId === userId || r.toEmployeeId === userId
  );

  return {
    pending: mine.filter((r) => r.status === 'pending'),
    history: mine
      .filter((r) => r.status !== 'pending')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20),
  };
}

export async function addSwapRequest(
  pvzId: string,
  request: Omit<SwapRequest, 'id' | 'createdAt' | 'status' | 'pvzId'>
): Promise<SwapRequest> {
  const requests = await readAll(pvzId);
  const entry: SwapRequest = {
    ...request,
    id: generateSecureId(),
    pvzId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  requests.push(entry);
  await writeAll(pvzId, requests);
  return entry;
}

async function executeShiftSwap(request: SwapRequest, pvzId: string): Promise<void> {
  let assignments = await getScheduleAssignments(pvzId);

  const fromShiftIndex = assignments.findIndex((s) => s.id === request.fromShiftId);
  const toShiftIndex = assignments.findIndex((s) => s.id === request.toShiftId);

  const allShifts = await shiftDataService.getShifts();
  const fromShift = allShifts.find((s) => s.id === request.fromShiftId);
  const toShift = allShifts.find((s) => s.id === request.toShiftId);

  if (fromShift && toShift) {
    await shiftDataService.updateShift(fromShift.id, {
      employeeId: toShift.employeeId,
      employeeName: toShift.employeeName,
    });
    await shiftDataService.updateShift(toShift.id, {
      employeeId: fromShift.employeeId,
      employeeName: fromShift.employeeName,
    });
  }

  if (fromShiftIndex !== -1 && toShiftIndex !== -1) {
    const tempEmployeeId = assignments[fromShiftIndex].employeeId;
    const tempEmployeeName = assignments[fromShiftIndex].employeeName;
    assignments[fromShiftIndex].employeeId = assignments[toShiftIndex].employeeId;
    assignments[fromShiftIndex].employeeName = assignments[toShiftIndex].employeeName;
    assignments[toShiftIndex].employeeId = tempEmployeeId;
    assignments[toShiftIndex].employeeName = tempEmployeeName;
    await saveScheduleAssignments(pvzId, assignments);
  }

  dataEventBus.notify('shifts');
}

export async function approveSwapRequest(
  pvzId: string,
  requestId: string
): Promise<SwapRequest | null> {
  const requests = await readAll(pvzId);
  const index = requests.findIndex((r) => r.id === requestId);
  if (index === -1 || requests[index].status !== 'pending') {
    return null;
  }

  const request = requests[index];
  await executeShiftSwap(request, pvzId);
  requests[index] = { ...request, status: 'approved' };
  await writeAll(pvzId, requests);
  return requests[index];
}

export async function rejectSwapRequest(pvzId: string, requestId: string): Promise<SwapRequest | null> {
  const requests = await readAll(pvzId);
  const index = requests.findIndex((r) => r.id === requestId);
  if (index === -1 || requests[index].status !== 'pending') {
    return null;
  }

  requests[index] = { ...requests[index], status: 'rejected' };
  await writeAll(pvzId, requests);
  return requests[index];
}

export async function cancelSwapRequest(
  pvzId: string,
  requestId: string,
  userId: string
): Promise<boolean> {
  const requests = await readAll(pvzId);
  const index = requests.findIndex((r) => r.id === requestId);
  if (index === -1) return false;

  const request = requests[index];
  if (request.status !== 'pending' || request.fromEmployeeId !== userId) {
    return false;
  }

  requests[index] = { ...request, status: 'rejected' };
  await writeAll(pvzId, requests);
  return true;
}

export { getShiftRequestNotifyRecipients as getSwapRequestNotifyRecipients };
