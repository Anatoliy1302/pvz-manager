do $$ begin
  alter publication supabase_realtime add table public.penalties;
exception when duplicate_object then null;
end $$;
