-- Composite index for common shift queries: filter by PVZ + date range
create index if not exists shifts_pvz_id_date_idx on public.shifts (pvz_id, date);

-- Employee shift history lookups
create index if not exists shifts_employee_id_date_idx on public.shifts (employee_id, date);
