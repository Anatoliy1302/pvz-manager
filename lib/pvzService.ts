import { apiRequest } from './apiClient';
import type { Pvz } from '../src/types/user';

type ApiPvz = {
  id: string;
  owner_id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  work_start?: string | null;
  work_end?: string | null;
  working_hours?: string | null;
  phone?: string | null;
  owner_inn?: string | null;
};

function mapPvz(row: ApiPvz): Pvz {
  return {
    id: row.id,
    name: row.name,
    address: row.address ?? '',
    workStart: row.work_start ?? '09:00',
    workEnd: row.work_end ?? '21:00',
    workingHours: row.working_hours ?? '09:00 - 21:00',
    phone: row.phone ?? '',
    ownerId: row.owner_id,
    ownerInn: row.owner_inn ?? undefined,
  };
}

function toApiBody(pvz: Partial<Pvz> & { name: string }) {
  return {
    name: pvz.name,
    address: pvz.address ?? '',
    city: '',
    work_start: pvz.workStart ?? '09:00',
    work_end: pvz.workEnd ?? '21:00',
    working_hours: pvz.workingHours ?? '09:00 - 21:00',
    phone: pvz.phone ?? '',
    owner_inn: pvz.ownerInn ?? null,
  };
}

export async function fetchPvzList(): Promise<Pvz[]> {
  const rows = await apiRequest<ApiPvz[]>('/api/pvz');
  return (rows ?? []).map(mapPvz);
}

export async function createPvz(pvz: Partial<Pvz> & { name: string }): Promise<Pvz> {
  const row = await apiRequest<ApiPvz>('/api/pvz', {
    method: 'POST',
    body: JSON.stringify(toApiBody(pvz)),
  });
  return mapPvz(row);
}

export async function updatePvz(id: string, pvz: Partial<Pvz> & { name: string }): Promise<Pvz> {
  const row = await apiRequest<ApiPvz>(`/api/pvz/${id}`, {
    method: 'PUT',
    body: JSON.stringify(toApiBody(pvz)),
  });
  return mapPvz(row);
}

export async function deletePvz(id: string): Promise<void> {
  await apiRequest(`/api/pvz/${id}`, { method: 'DELETE' });
}
