import { apiRequest } from './apiClient';
import type { Shift } from '../src/types/user';

type ApiShift = {
  id: string;
  pvz_id: string;
  user_id: string;
  employee_name?: string | null;
  date?: string | null;
  start_time: string;
  end_time?: string | null;
  status: string;
  payment_status?: string | null;
  shift_type?: string | null;
  total_hours?: number | null;
  earnings?: number | null;
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  } catch {
    return iso;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso.slice(0, 10);
  }
}

function mapShift(row: ApiShift, fallbackName = ''): Shift {
  const startIso = row.start_time;
  return {
    id: row.id,
    employeeId: row.user_id,
    employeeName: row.employee_name ?? fallbackName,
    date: row.date ?? formatDate(startIso),
    startTime: formatTime(startIso),
    endTime: row.end_time ? formatTime(row.end_time) : '',
    status: (row.status as Shift['status']) || 'active',
    paymentStatus: (row.payment_status as Shift['paymentStatus']) || 'pending',
    shiftType: row.shift_type as Shift['shiftType'],
    totalHours: row.total_hours ?? undefined,
    earnings: row.earnings ?? undefined,
    pvzId: row.pvz_id,
  };
}

export async function fetchShifts(): Promise<Shift[]> {
  const rows = await apiRequest<ApiShift[]>('/api/shifts');
  return (rows ?? []).map((row) => mapShift(row));
}

export async function fetchActiveShift(): Promise<Shift | null> {
  const row = await apiRequest<ApiShift | null>('/api/shifts/active');
  return row ? mapShift(row) : null;
}

export async function startShift(pvzId: string): Promise<Shift> {
  const row = await apiRequest<ApiShift>('/api/shifts/start', {
    method: 'POST',
    body: JSON.stringify({ pvz_id: pvzId }),
  });
  return mapShift(row);
}

export async function endShift(shiftId: string): Promise<Shift> {
  const row = await apiRequest<ApiShift>(`/api/shifts/${shiftId}/end`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return mapShift(row);
}

/** Planned shifts are stored in owner snapshot only — no live shift API. */
export async function upsertShift(shift: Shift): Promise<Shift> {
  if (shift.status === 'planned') {
    return shift;
  }

  if (shift.status === 'active' && shift.pvzId) {
    const active = await fetchActiveShift();
    if (active?.id) {
      return endShift(active.id);
    }
    return startShift(shift.pvzId);
  }

  const rows = await fetchShifts();
  const existing = rows.find((s) => s.id === shift.id);
  if (existing && (shift.status === 'completed' || shift.endTime)) {
    return endShift(existing.id);
  }

  return shift;
}

export async function deleteShift(shiftId: string): Promise<void> {
  try {
    await endShift(shiftId);
  } catch {
    // planned shifts are not in shifts table
  }
}
