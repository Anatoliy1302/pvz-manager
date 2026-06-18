import type { SupabaseClient } from '@supabase/supabase-js';

export interface DateRangeParams {
  fromDate: string;
  toDate: string;
}

export type ShiftStatusFilter = 'countable' | 'all';

export interface ShiftRow {
  id: string;
  pvz_id: string;
  pvz_name: string;
  employee_id: string;
  employee_name: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  payment_status: string;
  total_hours: number;
  earnings: number;
}

export interface SalaryEmployeeRow {
  employee_id: string;
  employee_name: string;
  phone: string;
  pvz_id: string;
  pvz_name: string;
  shifts_count: number;
  hours: number;
  accrued: number;
  fines: number;
  bonuses: number;
  withheld: number;
  net_payable: number;
  paid: number;
  balance: number;
}

export interface PvzRow {
  id: string;
  name: string;
  address: string;
  phone: string;
  employees_count: number;
  shifts_count: number;
}

interface OwnerEmployee {
  id: string;
  name: string;
  phone: string;
  pvz_id: string | null;
  pvz_ids: string[];
}

export function parseShiftStatusFilter(value: string | null): ShiftStatusFilter | { error: string } {
  if (!value || value === 'countable') return 'countable';
  if (value === 'all') return 'all';
  return { error: 'status must be countable (default) or all' };
}

export function parseDateRange(url: URL): DateRangeParams | { error: string } {
  const fromDate = url.searchParams.get('from_date');
  const toDate = url.searchParams.get('to_date');

  if (!fromDate || !toDate) {
    return { error: 'from_date and to_date are required (YYYY-MM-DD)' };
  }

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(fromDate) || !dateRe.test(toDate)) {
    return { error: 'Dates must be in YYYY-MM-DD format' };
  }

  if (fromDate > toDate) {
    return { error: 'from_date must be <= to_date' };
  }

  return { fromDate, toDate };
}

export function calcShiftHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60;
  return Math.round((minutes / 60) * 10) / 10;
}

export function isShiftCountable(status: string, paymentStatus: string): boolean {
  if (paymentStatus === 'paid') return true;
  return status === 'completed' || status === 'paid';
}

function matchesShiftStatusFilter(
  status: string,
  paymentStatus: string,
  filter: ShiftStatusFilter
): boolean {
  if (filter === 'all') return true;
  return isShiftCountable(status, paymentStatus);
}

async function getOwnerPvzIds(admin: SupabaseClient, ownerId: string): Promise<string[]> {
  const { data, error } = await admin.from('pvz').select('id').eq('owner_id', ownerId);
  if (error) throw new Error(`Failed to load PVZ: ${error.message}`);
  return (data || []).map((r) => r.id as string);
}

async function assertPvzOwnership(
  admin: SupabaseClient,
  ownerId: string,
  pvzId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from('pvz')
    .select('id')
    .eq('id', pvzId)
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

function isEmployeeAtPvz(emp: OwnerEmployee, pvzId: string): boolean {
  if (emp.pvz_id === pvzId) return true;
  return emp.pvz_ids.includes(pvzId);
}

function resolveEmployeePvzId(emp: OwnerEmployee, ownerPvzIds: string[], pvzId?: string): string {
  if (pvzId && isEmployeeAtPvz(emp, pvzId)) return pvzId;
  if (emp.pvz_id && ownerPvzIds.includes(emp.pvz_id)) return emp.pvz_id;
  return emp.pvz_ids.find((id) => ownerPvzIds.includes(id)) || emp.pvz_id || '';
}

async function fetchOwnerEmployees(
  admin: SupabaseClient,
  ownerPvzIds: string[],
  options?: { employeeId?: string; pvzId?: string }
): Promise<OwnerEmployee[]> {
  let query = admin
    .from('profiles')
    .select('id, name, phone, pvz_id, pvz_ids')
    .neq('role', 'owner')
    .eq('status', 'active');

  if (options?.employeeId) {
    query = query.eq('id', options.employeeId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load employees: ${error.message}`);

  const ownerPvzSet = new Set(ownerPvzIds);

  return (data || [])
    .map((row) => ({
      id: row.id as string,
      name: row.name as string,
      phone: row.phone as string,
      pvz_id: (row.pvz_id as string) || null,
      pvz_ids: (row.pvz_ids as string[]) || [],
    }))
    .filter((emp) => {
      const linked =
        (emp.pvz_id && ownerPvzSet.has(emp.pvz_id)) ||
        emp.pvz_ids.some((id) => ownerPvzSet.has(id));
      if (!linked) return false;
      if (options?.pvzId) return isEmployeeAtPvz(emp, options.pvzId);
      return true;
    });
}

export async function fetchShifts(
  admin: SupabaseClient,
  ownerId: string,
  params: DateRangeParams,
  options?: { pvzId?: string; statusFilter?: ShiftStatusFilter }
): Promise<ShiftRow[]> {
  const ownerPvzIds = await getOwnerPvzIds(admin, ownerId);
  if (ownerPvzIds.length === 0) return [];

  const pvzId = options?.pvzId;
  const statusFilter = options?.statusFilter ?? 'countable';

  if (pvzId) {
    const owned = await assertPvzOwnership(admin, ownerId, pvzId);
    if (!owned) throw new Error('PVZ not found or access denied');
  }

  const targetPvzIds = pvzId ? [pvzId] : ownerPvzIds;

  const { data: pvzRows } = await admin.from('pvz').select('id, name').in('id', targetPvzIds);
  const pvzNameMap = new Map((pvzRows || []).map((p) => [p.id as string, p.name as string]));

  const { data: shifts, error } = await admin
    .from('shifts')
    .select(
      'id, pvz_id, employee_id, employee_name, date, start_time, end_time, status, payment_status, total_hours, earnings'
    )
    .in('pvz_id', targetPvzIds)
    .gte('date', params.fromDate)
    .lte('date', params.toDate)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) throw new Error(`Failed to load shifts: ${error.message}`);

  return (shifts || [])
    .filter((s) =>
      matchesShiftStatusFilter(s.status as string, s.payment_status as string, statusFilter)
    )
    .map((s) => ({
      id: s.id as string,
      pvz_id: s.pvz_id as string,
      pvz_name: pvzNameMap.get(s.pvz_id as string) || '',
      employee_id: s.employee_id as string,
      employee_name: s.employee_name as string,
      date: s.date as string,
      start_time: s.start_time as string,
      end_time: s.end_time as string,
      status: s.status as string,
      payment_status: s.payment_status as string,
      total_hours:
        Number(s.total_hours) || calcShiftHours(s.start_time as string, s.end_time as string),
      earnings: Number(s.earnings) || 0,
    }));
}

export async function fetchSalary(
  admin: SupabaseClient,
  ownerId: string,
  params: DateRangeParams,
  options?: { employeeId?: string; pvzId?: string }
): Promise<SalaryEmployeeRow[]> {
  const ownerPvzIds = await getOwnerPvzIds(admin, ownerId);
  if (ownerPvzIds.length === 0) return [];

  const pvzId = options?.pvzId;
  if (pvzId) {
    const owned = await assertPvzOwnership(admin, ownerId, pvzId);
    if (!owned) throw new Error('PVZ not found or access denied');
  }

  const scopePvzIds = pvzId ? [pvzId] : ownerPvzIds;
  const employees = await fetchOwnerEmployees(admin, ownerPvzIds, {
    employeeId: options?.employeeId,
    pvzId,
  });

  if (!employees.length) return [];

  const { data: pvzRows } = await admin.from('pvz').select('id, name').in('id', ownerPvzIds);
  const pvzNameMap = new Map((pvzRows || []).map((p) => [p.id as string, p.name as string]));

  const empIds = employees.map((e) => e.id);

  const { data: shifts } = await admin
    .from('shifts')
    .select('employee_id, pvz_id, date, start_time, end_time, status, payment_status, earnings')
    .in('pvz_id', scopePvzIds)
    .in('employee_id', empIds)
    .gte('date', params.fromDate)
    .lte('date', params.toDate);

  const { data: penalties } = await admin
    .from('penalties')
    .select('employee_id, pvz_id, type, amount, date')
    .in('pvz_id', scopePvzIds)
    .in('employee_id', empIds)
    .gte('date', params.fromDate)
    .lte('date', params.toDate);

  const { data: payments } = await admin
    .from('payments')
    .select('employee_id, pvz_id, amount, created_at, status')
    .in('pvz_id', scopePvzIds)
    .in('employee_id', empIds)
    .eq('status', 'completed');

  const results: SalaryEmployeeRow[] = [];

  for (const emp of employees) {
    const empId = emp.id;
    const displayPvzId = resolveEmployeePvzId(emp, ownerPvzIds, pvzId);

    const empShifts = (shifts || []).filter(
      (s) =>
        s.employee_id === empId &&
        isShiftCountable(s.status as string, s.payment_status as string)
    );

    const shiftsEarned = empShifts.reduce((sum, s) => sum + (Number(s.earnings) || 0), 0);
    const hours = empShifts.reduce(
      (sum, s) => sum + calcShiftHours(s.start_time as string, s.end_time as string),
      0
    );

    const empPenalties = (penalties || []).filter((p) => p.employee_id === empId);
    const totalFines = empPenalties
      .filter((p) => p.type === 'fine')
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const totalBonuses = empPenalties
      .filter((p) => p.type === 'bonus')
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const netDeduction = Math.max(0, totalFines - totalBonuses);
    const netEarned = Math.max(0, shiftsEarned - netDeduction);

    const empPayments = (payments || []).filter((p) => {
      if (p.employee_id !== empId) return false;
      const paidDate = ((p.created_at as string) || '').split('T')[0];
      return paidDate >= params.fromDate && paidDate <= params.toDate;
    });
    const totalPaid = empPayments.reduce((sum, p) => sum + Number(p.amount), 0);

    results.push({
      employee_id: empId,
      employee_name: emp.name,
      phone: emp.phone,
      pvz_id: displayPvzId,
      pvz_name: pvzNameMap.get(displayPvzId) || '',
      shifts_count: empShifts.length,
      hours: Math.round(hours * 10) / 10,
      accrued: Math.round(shiftsEarned),
      fines: Math.round(totalFines),
      bonuses: Math.round(totalBonuses),
      withheld: Math.round(netDeduction),
      net_payable: Math.round(netEarned),
      paid: Math.round(totalPaid),
      balance: Math.round(Math.max(0, netEarned - totalPaid)),
    });
  }

  return results.sort((a, b) => a.employee_name.localeCompare(b.employee_name, 'ru'));
}

export async function fetchPvzList(
  admin: SupabaseClient,
  ownerId: string
): Promise<PvzRow[]> {
  const { data: pvzList, error } = await admin
    .from('pvz')
    .select('id, name, address, phone')
    .eq('owner_id', ownerId)
    .order('name');

  if (error) throw new Error(`Failed to load PVZ: ${error.message}`);
  if (!pvzList?.length) return [];

  const pvzIds = pvzList.map((p) => p.id as string);
  const employees = await fetchOwnerEmployees(admin, pvzIds);

  const { data: shiftCounts } = await admin
    .from('shifts')
    .select('pvz_id')
    .in('pvz_id', pvzIds);

  const empCountMap = new Map<string, number>();
  for (const pvzId of pvzIds) {
    empCountMap.set(
      pvzId,
      employees.filter((e) => isEmployeeAtPvz(e, pvzId)).length
    );
  }

  const shiftCountMap = new Map<string, number>();
  for (const s of shiftCounts || []) {
    const pid = s.pvz_id as string;
    shiftCountMap.set(pid, (shiftCountMap.get(pid) || 0) + 1);
  }

  return pvzList.map((p) => ({
    id: p.id as string,
    name: p.name as string,
    address: p.address as string,
    phone: p.phone as string,
    employees_count: empCountMap.get(p.id as string) || 0,
    shifts_count: shiftCountMap.get(p.id as string) || 0,
  }));
}
