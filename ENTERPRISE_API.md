# Enterprise REST API — «Персонал ПВЗ»

REST API для сетей ПВЗ (тариф **Enterprise**): выгрузка смен, расчёт зарплаты и экспорт данных для интеграции с **1С** и бухгалтерией.

**Базовый URL:**

```
https://wygpcndnlxfzbbuogqrt.supabase.co/functions/v1/enterprise-api
```

> Замените `wygpcndnlxfzbbuogqrt` на ref вашего Supabase-проекта, если используете другой инстанс.

---

## Требования

| Параметр | Значение |
|---|---|
| Тариф | **Enterprise** (активный) |
| Роль | **Владелец** (owner) |
| Аутентификация | JWT-токен **или** API-ключ |

Pro и Free не имеют доступа к API — ответ `403 Enterprise subscription required`.

---

## Аутентификация

Все запросы требуют заголовок Supabase (для прохождения шлюза):

```
apikey: <SUPABASE_ANON_KEY>
```

### Способ 1: API-ключ (рекомендуется для 1С и серверных интеграций)

```
X-API-Key: pvz_ent_<ваш_ключ>
```

или

```
Authorization: Bearer pvz_ent_<ваш_ключ>
```

### Способ 2: JWT-токен (для тестирования из приложения)

Получите access token после входа владельца в приложение:

```
Authorization: Bearer <supabase_access_token>
```

---

## Как получить API-ключ

### Через API (JWT)

```bash
curl -X POST "https://wygpcndnlxfzbbuogqrt.supabase.co/functions/v1/enterprise-api/keys" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <JWT_ВЛАДЕЛЬЦА>" \
  -H "Content-Type: application/json" \
  -d '{"name": "1С интеграция"}'
```

Ответ (ключ показывается **один раз**):

```json
{
  "id": "uuid",
  "name": "1С интеграция",
  "key_prefix": "pvz_ent_a1b2c3",
  "api_key": "pvz_ent_a1b2c3d4e5f6...",
  "created_at": "2026-06-17T10:00:00Z",
  "warning": "Сохраните api_key сейчас — он больше не будет показан."
}
```

### Через приложение Supabase (SQL / RPC)

Если владелец авторизован в Supabase Dashboard:

```sql
select * from create_enterprise_api_key('1С интеграция');
```

### Список ключей

```bash
curl "https://wygpcndnlxfzbbuogqrt.supabase.co/functions/v1/enterprise-api/keys" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <JWT>"
```

### Отзыв ключа

```bash
curl -X DELETE "https://wygpcndnlxfzbbuogqrt.supabase.co/functions/v1/enterprise-api/keys/<KEY_ID>" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <JWT>"
```

---

## Эндпоинты

### GET `/shifts` — список смен

**Параметры (query):**

| Параметр | Обязательный | Описание |
|---|---|---|
| `from_date` | да | Начало периода `YYYY-MM-DD` |
| `to_date` | да | Конец периода `YYYY-MM-DD` |
| `pvz_id` | нет | UUID конкретного ПВЗ |
| `status` | нет | `countable` (по умолчанию) — только завершённые/оплаченные смены, как в `/salary`; `all` — все статусы |

**Пример:**

```bash
curl "https://wygpcndnlxfzbbuogqrt.supabase.co/functions/v1/enterprise-api/shifts?from_date=2026-06-01&to_date=2026-06-30" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "X-API-Key: pvz_ent_<ваш_ключ>"
```

**Ответ:**

```json
{
  "data": [
    {
      "id": "uuid",
      "pvz_id": "uuid",
      "pvz_name": "ПВЗ Центральный",
      "employee_id": "uuid",
      "employee_name": "Иванов Иван",
      "date": "2026-06-15",
      "start_time": "09:00",
      "end_time": "21:00",
      "status": "completed",
      "payment_status": "pending",
      "total_hours": 12,
      "earnings": 2400
    }
  ],
  "meta": {
    "from_date": "2026-06-01",
    "to_date": "2026-06-30",
    "count": 1,
    "pvz_id": null,
    "status": "countable"
  }
}
```

> По умолчанию `/shifts` возвращает те же смены, что учитываются в расчёте зарплаты (`completed`, `paid`). Для полного расписания передайте `status=all`.

---

### GET `/salary` — расчёт зарплаты за период

**Параметры (query):**

| Параметр | Обязательный | Описание |
|---|---|---|
| `from_date` | да | `YYYY-MM-DD` |
| `to_date` | да | `YYYY-MM-DD` |
| `employee_id` | нет | UUID сотрудника |
| `pvz_id` | нет | UUID ПВЗ — ведомость только по этой точке |

**Пример:**

```bash
curl "https://wygpcndnlxfzbbuogqrt.supabase.co/functions/v1/enterprise-api/salary?from_date=2026-06-01&to_date=2026-06-30" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "X-API-Key: pvz_ent_<ваш_ключ>"
```

**Ответ:**

```json
{
  "data": [
    {
      "employee_id": "uuid",
      "employee_name": "Иванов Иван",
      "phone": "+79001234567",
      "pvz_id": "uuid",
      "pvz_name": "ПВЗ Центральный",
      "shifts_count": 20,
      "hours": 240,
      "accrued": 48000,
      "fines": 500,
      "bonuses": 1000,
      "withheld": 0,
      "net_payable": 48500,
      "paid": 30000,
      "balance": 18500
    }
  ],
  "meta": {
    "from_date": "2026-06-01",
    "to_date": "2026-06-30",
    "count": 1,
    "employee_id": null,
    "pvz_id": null
  }
}
```

**Логика расчёта:**

- `accrued` — сумма за завершённые смены
- `withheld` — удержания: штрафы минус бонусы (не налоги, не меньше 0)
- `net_payable` — к выплате: `accrued - withheld`
- `paid` — выплаты за период
- `balance` — остаток: `net_payable - paid`

---

### GET `/pvz` — список ПВЗ сети

```bash
curl "https://wygpcndnlxfzbbuogqrt.supabase.co/functions/v1/enterprise-api/pvz" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "X-API-Key: pvz_ent_<ваш_ключ>"
```

**Ответ:**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "ПВЗ Центральный",
      "address": "ул. Ленина, 1",
      "phone": "+79001234567",
      "employees_count": 5,
      "shifts_count": 120
    }
  ],
  "meta": { "count": 1 }
}
```

---

### POST `/export` — экспорт для 1С

**Тело запроса (JSON):**

| Поле | Обязательный | Описание |
|---|---|---|
| `from_date` | да | `YYYY-MM-DD` |
| `to_date` | да | `YYYY-MM-DD` |
| `format` | нет | `xml` (по умолчанию для 1С), `json`, `csv` |
| `pvz_id` | нет | UUID ПВЗ — ведомость и смены только по этой точке |
| `inline` | нет | `true` — вернуть файл в теле ответа |

**Пример — ссылка на скачивание (рекомендуется):**

```bash
curl -X POST "https://wygpcndnlxfzbbuogqrt.supabase.co/functions/v1/enterprise-api/export" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "X-API-Key: pvz_ent_<ваш_ключ>" \
  -H "Content-Type: application/json" \
  -d '{
    "from_date": "2026-06-01",
    "to_date": "2026-06-30"
  }'
```

Если `format` не указан, по умолчанию используется **xml** (для 1С).

**Ответ:**

```json
{
  "download_url": "https://...supabase.co/storage/v1/object/sign/api-exports/...",
  "expires_at": "2026-06-17T11:00:00Z",
  "format": "xml",
  "period": {
    "from_date": "2026-06-01",
    "to_date": "2026-06-30"
  },
  "path": "owner-uuid/export_....xml"
}
```

Ссылка действует **1 час**.

**Пример — файл в ответе (inline):**

```bash
curl -X POST ".../enterprise-api/export" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "X-API-Key: pvz_ent_<ваш_ключ>" \
  -H "Content-Type: application/json" \
  -d '{"from_date":"2026-06-01","to_date":"2026-06-30","format":"csv","inline":true}' \
  -o payroll_june.csv
```

---

## Интеграция с 1С

### Формат XML (рекомендуется)

Структура совместима с типовой обработкой внешних данных 1С:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<PayrollExport xmlns="http://pvzpersonal.ru/1c/payroll/1.0">
  <Meta>
    <PeriodFrom>2026-06-01</PeriodFrom>
    <PeriodTo>2026-06-30</PeriodTo>
    <GeneratedAt>2026-06-17T10:00:00Z</GeneratedAt>
  </Meta>
  <Payroll>
    <Employee>
      <Id>uuid</Id>
      <Name>Иванов Иван</Name>
      <NetPayable>48500</NetPayable>
      ...
    </Employee>
  </Payroll>
  <Shifts>
    <Shift>
      <Date>2026-06-15</Date>
      <Earnings>2400</Earnings>
      ...
    </Shift>
  </Shifts>
</PayrollExport>
```

### Настройка в 1С:Предприятие 8

1. **Создайте HTTP-соединение** (конфигурация → общие настройки или внешняя обработка).
2. **Запланируйте регламентное задание** (ежедневно / еженедельно):
   - Вызов `POST /export` с `format: xml`
   - Скачивание файла по `download_url`
   - Импорт XML в документ «Начисление зарплаты» или табличную часть
3. **Сопоставьте поля:**
   - `Employee.Name` → Физическое лицо / Сотрудник
   - `Employee.NetPayable` → Сумма к начислению
   - `Employee.Paid` → Уже выплачено
   - `Employee.Balance` → Остаток к выплате

### Формат CSV

UTF-8 с BOM. Две секции: **ВЕДОМОСТЬ НАЧИСЛЕНИЙ** и **ДЕТАЛИЗАЦИЯ СМЕН**. Подходит для ручного импорта через «Загрузка из файла» в 1С или Excel.

### Формат JSON

Полная структура для кастомных интеграций и middleware между API и 1С.

---

## Rate limiting

| Лимит | Значение |
|---|---|
| По умолчанию | **100 запросов / минуту** на владельца |
| Настройка | `ENTERPRISE_API_RATE_LIMIT` (env Edge Function) |
| При превышении | HTTP `429 Rate limit exceeded` |

---

## Логирование

Все запросы записываются в таблицу `api_logs`:

- эндпоинт, метод, статус
- IP, User-Agent
- параметры запроса
- время ответа (мс)

Владелец может просматривать логи через Supabase Dashboard (RLS: только свои записи).

---

## Коды ошибок

| HTTP | Описание |
|---|---|
| `401` | Неверный или отсутствующий токен / API-ключ |
| `403` | Нет тарифа Enterprise или недостаточно прав |
| `429` | Превышен лимит запросов |
| `400` | Неверные параметры (даты, формат) |
| `404` | Эндпоинт или ресурс не найден |
| `500` | Внутренняя ошибка сервера |

---

## FAQ

### Кто может использовать API?

Только **владельцы** с активным тарифом **Enterprise**. Тариф назначается через поддержку (`support@pvzpersonal.ru`).

### Можно ли использовать один API-ключ для нескольких интеграций?

Да, но рекомендуется отдельный ключ на каждую систему (1С, BI, middleware) — так проще отозвать доступ.

### Как часто можно запрашивать экспорт?

Рекомендуется: 1–4 раза в сутки (после закрытия смен / перед выплатой). Лимит — 100 запросов в минуту.

### Поддерживается ли webhook?

В текущей версии — нет. Планируется в следующих релизах Enterprise API. Сейчас используйте polling (регламентное задание в 1С).

### Что делать, если ключ утёк?

Немедленно отзовите ключ (`DELETE /keys/:id`) и создайте новый.

### Нужен ли `apikey` заголовок?

Да. Supabase Edge Functions требуют `apikey: <SUPABASE_ANON_KEY>` даже при использовании API-ключа или JWT.

### Как протестировать в Postman?

1. Collection → Variables: `base_url`, `anon_key`, `api_key`
2. Headers: `apikey: {{anon_key}}`, `X-API-Key: {{api_key}}`
3. GET `{{base_url}}/pvz` — проверка подключения
4. POST `{{base_url}}/export` — тест выгрузки

---

## Деплой (для разработчиков)

```bash
# 1. Применить миграцию
node supabase/setup/apply-migration-17100000.mjs

# 2. (Опционально) лимит запросов
npx supabase secrets set ENTERPRISE_API_RATE_LIMIT=100 --project-ref wygpcndnlxfzbbuogqrt

# 3. Деплой функции
node supabase/setup/deploy-enterprise-api.mjs
```

**Файлы:**

| Файл | Назначение |
|---|---|
| `supabase/migrations/20250617100000_enterprise_api.sql` | Таблицы `api_keys`, `api_logs`, storage bucket |
| `supabase/functions/enterprise-api/index.ts` | Роутер API |
| `supabase/functions/_shared/enterprise-api-*.ts` | Auth, данные, экспорт |
| `supabase/setup/deploy-enterprise-api.mjs` | Скрипт деплоя |

---

## Поддержка

- Email: **support@pvzpersonal.ru**
- Тема письма: `Enterprise API — <название сети ПВЗ>`

При обращении укажите `owner_id` (UUID владельца) и пример запроса (без API-ключа).
