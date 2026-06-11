-- Realtime для заявок на смены и приглашений

do $$
begin
  alter publication supabase_realtime add table public.shift_requests;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.invitations;
exception
  when duplicate_object then null;
end $$;
