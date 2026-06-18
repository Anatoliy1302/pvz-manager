@echo off
chcp 65001 >nul
title Настройка Supabase Email OTP

echo ============================================
echo  Настройка Supabase для отправки Email OTP
echo ============================================
echo.
echo Этот скрипт настраивает Supabase проект для отправки
echo кодов подтверждения на email через Edge Function.
echo.
echo Проверьте что в .env заполнены все переменные.
echo.

:: ===== Установка секретов для Edge Function =====
echo [1/3] Устанавливаю секреты в Supabase...
echo.

npx supabase secrets set NOTISEND_SMTP_PASSWORD=2f4d7f7a664cfc87c86cf4e07852f4d5 --project-ref wygpcndnlxfzbbuogqrt
npx supabase secrets set NOTISEND_SMTP_USER=krv_kravec@mail.ru --project-ref wygpcndnlxfzbbuogqrt
npx supabase secrets set NOTISEND_FROM_EMAIL=noreply@pvzpersonal.ru --project-ref wygpcndnlxfzbbuogqrt
npx supabase secrets set SEND_EMAIL_HOOK_SECRET=v1,whsec_o/5dtLVqTpYmMpO3pdosmo2RnTKWbLXx60w9JwsjT8Y= --project-ref wygpcndnlxfzbbuogqrt

:: ===== SMTP секреты для встроенной отправки (fallback) =====
echo Устанавливаю SMTP секреты (fallback)...
npx supabase secrets set SMTP_USER=razrabotka_vl@mail.ru --project-ref wygpcndnlxfzbbuogqrt
npx supabase secrets set SMTP_HOST=smtp.notisend.ru --project-ref wygpcndnlxfzbbuogqrt
npx supabase secrets set SMTP_PORT=587 --project-ref wygpcndnlxfzbbuogqrt

:: ВАЖНО: SMTP_PASSWORD нужно указать вручную!
echo.
echo ⚠️  ВАЖНО: Укажите пароль от SMTP:
echo    SMTP_USER=%SMTP_USER%
echo.
echo    Добавьте в .env строку: SMTP_PASSWORD=ваш_пароль
echo    Затем выполните:
echo    npx supabase secrets set SMTP_PASSWORD=ваш_пароль --project-ref wygpcndnlxfzbbuogqrt
echo.

:: ===== Деплой Edge Function =====
echo.
echo [2/3] Деплою Edge Function send-auth-email...
echo.
npx supabase functions deploy send-auth-email --project-ref wygpcndnlxfzbbuogqrt

:: ===== Настройка Auth Hook =====
echo.
echo [3/3] Настройка Auth Hook (Send Email)...
echo.
echo ⚠️  ВАЖНО: Настройте хук в Supabase Dashboard:
echo.
echo   1. Откройте https://supabase.com/dashboard/project/wygpcndnlxfzbbuogqrt/auth/hooks
echo   2. Нажмите "Create a new hook"
echo   3. Параметры:
echo      - Hook Name: Send Email OTP
echo      - Hook Type: Send Email (triggered when an email OTP is sent)
echo      - HTTP Request Method: POST
echo      - HTTP Request URL: https://wygpcndnlxfzbbuogqrt.supabase.co/functions/v1/send-auth-email
echo      - HTTP Headers:
echo        - Key: Content-Type, Value: application/json
echo        - Key: webhook-id, Value: (оставьте пустым - Supabase заполнит сам)
echo        - Key: webhook-signature, Value: (оставьте пустым)
echo        - Key: webhook-timestamp, Value: (оставьте пустым)
echo      - Secret: v1,whsec_o/5dtLVqTpYmMpO3pdosmo2RnTKWbLXx60w9JwsjT8Y=
echo      - Retry on failure: Включите (1-2 попытки)
echo      - Timeout: 5000 (ms)
echo      - Enabled: ✅ Включено
echo   4. Сохраните
echo.
echo ============================================
echo  Готово!
echo ============================================
pause
