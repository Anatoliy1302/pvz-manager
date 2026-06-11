-- Webhook: при INSERT в support_messages → Edge Function → email
-- После деплоя выполните supabase/setup/configure-support-webhook.sql

create extension if not exists pg_net with schema extensions;

create schema if not exists private;

create table if not exists private.support_notify_config (
  singleton boolean primary key default true check (singleton),
  function_url text not null,
  webhook_secret text not null
);

revoke all on schema private from public;
revoke all on table private.support_notify_config from public;

create or replace function public.notify_support_message_email()
returns trigger
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  cfg record;
  payload jsonb;
begin
  select function_url, webhook_secret
  into cfg
  from private.support_notify_config
  where singleton = true;

  if cfg.function_url is null or cfg.webhook_secret is null then
    raise warning 'support_notify_config is not configured';
    return new;
  end if;

  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'support_messages',
    'record', jsonb_build_object(
      'id', new.id,
      'topic', new.topic,
      'message', new.message,
      'user_name', new.user_name,
      'user_role', new.user_role,
      'user_phone', new.user_phone,
      'pvz_id', new.pvz_id,
      'pvz_name', new.pvz_name,
      'app_version', new.app_version,
      'platform', new.platform,
      'created_at', new.created_at
    )
  );

  perform net.http_post(
    url := cfg.function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', cfg.webhook_secret
    ),
    body := payload
  );

  return new;
exception
  when others then
    raise warning 'support email notify failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists support_messages_after_insert_notify on public.support_messages;

create trigger support_messages_after_insert_notify
after insert on public.support_messages
for each row
execute function public.notify_support_message_email();
