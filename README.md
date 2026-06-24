# Персонал ПВЗ

Мобильное приложение для управления персоналом пунктов выдачи заказов (ПВЗ): смены, зарплата, чат, аналитика и подписка Pro.

## Стек

- **React Native** + **Expo SDK 54**
- **TypeScript**
- **VPS API** (`api.pvzpersonal.ru`) — auth, sync, оплата, SMS/email OTP
- **PostgreSQL** на VPS
- **React Navigation**, **i18next** (9 языков)

## Требования

- Node.js 20+
- npm
- Android Studio (для нативной сборки) или EAS Build

## Быстрый старт

```bash
npm install
cp .env.example .env   # EXPO_PUBLIC_API_URL и другие переменные
npm start
```

Для Android:

```bash
npm run android
```

## Переменные окружения (клиент)

| Переменная | Описание |
|---|---|
| `EXPO_PUBLIC_API_URL` | URL API на VPS (`https://api.pvzpersonal.ru`) |
| `EXPO_PUBLIC_USE_EMAIL_OTP` | Вход владельца по email OTP |
| `EXPO_PUBLIC_USE_SMS_OTP` | Вход сотрудников по SMS OTP |
| `EXPO_PUBLIC_DEMO_MODE` | Локальный демо-режим без сети |

Секреты (`JWT_SECRET`, `YOOKASSA_*`, `NOTISEND_API_KEY`, `SMS_AERO_*`) — только в `server/.env` на VPS и EAS Secrets, **не в репозитории**.

## API на VPS

```bash
npm run deploy:api      # деплой server/ на VPS
npm run verify:api      # проверка HTTPS
```

Основные endpoint'ы: `/api/auth/*`, `/api/sync`, `/api/subscription/*`, `/api/chat/*`.

## Сборка release

```bash
npm run build:production   # EAS Build
# или локально:
cd android && ./gradlew assembleRelease
```

## Структура

```
src/           — экраны, компоненты, хуки, i18n
lib/           — HTTP-клиент auth/sync/chat
server/        — Express API (Node.js + PostgreSQL)
android/       — нативный Android (prebuild)
```

## Правовые документы

- Политика конфиденциальности: https://pvzpersonal.ru/privacy
- Пользовательское соглашение: https://pvzpersonal.ru/terms
- Поддержка: support@pvzpersonal.ru

## Лицензия

Proprietary — все права защищены.

## Безопасность репозитория

- **`.env`** и **`builds/*.apk`** в `.gitignore` — не коммитьте секреты и артефакты сборки.
- Если `.env` или APK попали в историю git:

```bash
# Проверка (dry-run)
node scripts/purge-env-from-git-history.mjs

# Переписать историю (нужен git-filter-repo: pip install git-filter-repo)
node scripts/purge-env-from-git-history.mjs --apply
node scripts/purge-env-from-git-history.mjs --apply --builds

# После согласования с командой
git push --force-with-lease origin --all
```

- Убрать `builds/` только из индекса (файлы остаются на диске): `scripts/clean-builds-from-git.bat` (Windows) или `.sh` (Linux/macOS).
