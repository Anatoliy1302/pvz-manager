-- Включить Realtime для авансов и настроек зарплаты

do $$
begin
  alter publication supabase_realtime add table public.advance_requests;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.global_salary_settings;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.employee_salary_settings;
exception
  when duplicate_object then null;
end $$;
