-- Привести support_messages к схеме приложения (topic, pvz_id, app_version и др.)

alter table public.support_messages add column if not exists topic text;
alter table public.support_messages add column if not exists user_role text;
alter table public.support_messages add column if not exists pvz_id text;
alter table public.support_messages add column if not exists pvz_name text;
alter table public.support_messages add column if not exists app_version text;
alter table public.support_messages add column if not exists platform text;

-- backfill topic из legacy subject
update public.support_messages
set topic = case
  when subject ilike '%bug%' or subject ilike '%ошиб%' then 'bug'
  when subject ilike '%feature%' or subject ilike '%предлож%' or subject ilike '%иде%' then 'feature'
  else 'other'
end
where topic is null
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'support_messages'
      and column_name = 'subject'
  );

update public.support_messages set topic = 'other' where topic is null;

alter table public.support_messages alter column topic set default 'other';
update public.support_messages set topic = 'other' where topic is null;

do $$ begin
  alter table public.support_messages
    add constraint support_messages_topic_check
    check (topic in ('bug', 'feature', 'other'));
exception when duplicate_object then null;
end $$;
