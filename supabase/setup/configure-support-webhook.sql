-- Одноразовая настройка webhook для писем в поддержку
--
-- 1) Деплой функции:
--    supabase functions deploy support-notification
--
-- 2) Секреты (пароль — «пароль для внешних приложений» в настройках Mail.ru):
--    supabase secrets set SMTP_PASSWORD="ваш_пароль_приложения"
--    supabase secrets set WEBHOOK_SECRET="длинный_случайный_ключ"
--    supabase secrets set SMTP_USER="razrabotka_vl@mail.ru"
--    supabase secrets set SUPPORT_EMAIL_TO="razrabotka_vl@mail.ru"
--
-- 3) Добавьте в .env: SUPPORT_WEBHOOK_SECRET=тот_же_ключ_что_и_WEBHOOK_SECRET
--    Затем: node supabase/setup/apply-support-webhook.mjs
--
-- Или вручную (замените PROJECT_REF и секрет):

insert into private.support_notify_config (singleton, function_url, webhook_secret)
values (
  true,
  'https://wygpcndnlxfzbbuogqrt.supabase.co/functions/v1/support-notification',
  'длинный_случайный_ключ'
)
on conflict (singleton) do update
set
  function_url = excluded.function_url,
  webhook_secret = excluded.webhook_secret;

-- WEBHOOK_SECRET здесь и в supabase secrets set WEBHOOK_SECRET должны совпадать.
