# Персонал ПВЗ

Мобильное приложение для управления персоналом пунктов выдачи заказов (ПВЗ): смены, зарплата, чат, аналитика и подписка Pro.

## Стек

- **React Native** + **Expo SDK 54**
- **TypeScript**
- **Supabase** (Auth OTP, PostgreSQL, Edge Functions, Realtime)
- **React Navigation**, **i18next** (9 языков)

## Требования

- Node.js 20+
- npm
- Android Studio (для нативной сборки) или EAS Build

## Быстрый старт

```bash
npm install
cp .env.example .env   # заполните EXPO_PUBLIC_SUPABASE_* и другие переменные
npm start
```

Для Android:

```bash
npm run android
```

## Переменные окружения

| Переменная | Описание |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | URL проекта Supabase |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) ключ |
| `EXPO_PUBLIC_USE_SUPABASE_EMAIL_OTP` | Вход владельца по email OTP |
| `EXPO_PUBLIC_USE_SUPABASE_PHONE_OTP` | Вход по SMS OTP |
| `EXPO_PUBLIC_DEMO_MODE` | Локальный демо-режим без Supabase |

Секреты (`SUPABASE_SERVICE_ROLE_KEY`, `YOOKASSA_*`, `NOTISEND_API_KEY`) — только в Supabase Secrets / EAS Secrets, **не в репозитории**.

## Supabase Edge Functions

```bash
npm run deploy:payments    # create-payment, cancel-subscription, delete-account, …
npm run deploy:sms
npm run deploy:push
```

Удаление аккаунта: `POST /functions/v1/delete-account` с Bearer-токеном пользователя.

## Сборка release

```bash
npm run build:production   # EAS Build
# или локально:
cd android && ./gradlew assembleRelease
```

Release-сборка Android включает R8/ProGuard (`android.enableMinifyInReleaseBuilds=true`).

## Структура

```
src/           — экраны, компоненты, хуки, i18n
lib/           — Supabase-клиент и REST-обёртки
supabase/      — миграции, Edge Functions, email-шаблоны
android/       — нативный Android (prebuild)
```

## Правовые документы

- Политика конфиденциальности: https://pvzpersonal.ru/privacy
- Пользовательское соглашение: https://pvzpersonal.ru/terms
- Поддержка: support@pvzpersonal.ru

## Лицензия

См. [LICENSE](LICENSE). Все права защищены.
