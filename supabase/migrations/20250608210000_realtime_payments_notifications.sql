-- Realtime для выплат и уведомлений

do $$
begin
  alter publication supabase_realtime add table public.payments;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
end $$;
