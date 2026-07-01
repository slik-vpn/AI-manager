# AI Управляющий SLIK Place

Foundation Telegram-бота для управления SLIK Place.

## Стек

- Node.js 20+
- TypeScript
- Telegraf
- Prisma
- SQLite
- Docker / Docker Compose

## Возможности foundation

- Роли пользователей: `OWNER`, `MANAGER`, `EMPLOYEE`.
- Статусы пользователей: `PENDING`, `ACTIVE`, `ARCHIVED`.
- Уровни событий: `INFO`, `WARNING`, `ALERT`, `FINANCE`.
- Типы событий: `USER_REGISTERED`, `USER_APPROVED`, `ROLE_CHANGED`, `BOT_STARTED`, `BOT_ERROR`, `SHIFT_CREATED`, `SHIFT_RESPONSE_CREATED`, `SHIFT_ASSIGNED`, `SHIFT_STARTED`, `SHIFT_READY`, `SHIFT_COMPLETED`, `SHIFT_PHOTO_ADDED`, `SHIFT_REPORT_CREATED`, `SHIFT_CLOSED`.
- Модели Prisma: `User`, `EventLog`, `Shift`, `ShiftResponse`, `ShiftPhoto`, `ShiftReport`.
- Команды Telegram:
  - `/start` — регистрация и меню по роли.
  - `/me` — профиль текущего пользователя.
  - `/users` — список пользователей для `OWNER` и `MANAGER`.
  - `/approve <telegramId>` — подтверждение пользователя для `OWNER` и `MANAGER`.
  - `/role <telegramId> manager|employee` — смена роли для `OWNER`.
  - `/shifts` — доступные открытые смены текущей недели для сотрудников и менеджеров; `OWNER` видит все смены со статусами.
  - `/my_shifts` — назначенные смены текущего пользователя.
  - `/create_shift YYYY-MM-DD HH:mm HH:mm Название смены` — ручное создание смены для `OWNER` и `MANAGER`.
  - `/take_shift <shiftId>` — отклик сотрудника `TAKE` на открытую смену.
  - `/decline_shift <shiftId>` — отклик сотрудника `DECLINE` на смену.
  - `/start_shift <shiftId>` — запрос фото начала назначенной смены.
  - `/ready_shift <shiftId>` — запрос фото готовности площадки.
  - `/end_shift <shiftId>` — запрос фото конца смены.
  - `/report_shift <shiftId>` — заполнение отчета по мероприятию после завершения смены.
  - `/shift_responses <shiftId>` — просмотр откликов на смену для `OWNER`.
  - `/assign_shift <shiftId> <telegramId>` — назначение активного сотрудника на смену для `OWNER`.
  - `/shift_report <shiftId>` — просмотр отчета по смене для `OWNER`.

## Модуль смен

Базовый модуль смен работает без интеграции с YClients, зарплат, задач и инцидентов. `OWNER` или `MANAGER` создают смену вручную командой:

```text
/create_shift 2026-07-05 18:00 23:00 Общий зал
```

Новая смена получает статус `OPEN`. Сотрудники и менеджеры через `/shifts` видят только открытые доступные смены текущей календарной недели с понедельника по воскресенье, `OWNER` видит все смены со статусами. Сотрудники и менеджеры могут отправить отклик `TAKE` или `DECLINE`, а назначенные смены смотрят через `/my_shifts`. `OWNER` просматривает отклики через `/shift_responses <shiftId>` и назначает активного пользователя командой `/assign_shift <shiftId> <telegramId>`, после чего смена получает статус `ASSIGNED` и привязку `assignedUserId`.

### Фото-контроль смен

Фото-контроль доступен только назначенному сотруднику смены:

1. `/start_shift <shiftId>` — бот просит отправить фото начала смены. До отправки фото статус смены не меняется. После фото сохраняется `telegramFileId`, создается `ShiftPhoto` с типом `START`, статус смены становится `STARTED`, а в `EventLog` пишутся `SHIFT_PHOTO_ADDED` и `SHIFT_STARTED`.
2. `/ready_shift <shiftId>` — бот просит отправить фото готовности площадки. После фото сохраняется `ShiftPhoto` с типом `READY`, статус смены становится `READY`, а в `EventLog` пишутся `SHIFT_PHOTO_ADDED` и `SHIFT_READY`.
3. `/end_shift <shiftId>` — бот просит отправить фото конца смены. До отправки фото смена не завершается. После фото сохраняется `ShiftPhoto` с типом `END`, статус смены становится `COMPLETED`, а в `EventLog` пишутся `SHIFT_PHOTO_ADDED` и `SHIFT_COMPLETED`.

Сотрудник не может управлять чужой сменой: команды фото-контроля проверяют `assignedUserId`. После статуса `COMPLETED` назначенный сотрудник заполняет отчет командой `/report_shift <shiftId>`: бот последовательно спрашивает количество гостей, были ли проблемы, повреждения и конфликт, затем комментарий. Без отчета смена остается `COMPLETED`; после сохранения `ShiftReport` смена становится `CLOSED`, а в `EventLog` пишутся `SHIFT_REPORT_CREATED` и `SHIFT_CLOSED`. `OWNER` смотрит отчет командой `/shift_report <shiftId>`. `OWNER` видит текущий статус всех смен через `/shifts`.

Статусы смен: `NEW`, `OPEN`, `WAITING_OWNER_CONFIRMATION`, `ASSIGNED`, `STARTED`, `READY`, `COMPLETED`, `CLOSED`, `CANCELLED`. Типы откликов: `TAKE`, `DECLINE`. Типы фото смены: `START`, `READY`, `END`.

## Быстрый старт

```bash
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

В `.env` укажите токен Telegram-бота и Telegram ID владельца:

```dotenv
BOT_TOKEN=123456:replace_with_telegram_bot_token
DATABASE_URL="file:./data/dev.sqlite"
OWNER_TELEGRAM_IDS=123456789
```

`OWNER_TELEGRAM_IDS` обязателен, должен содержать минимум один Telegram ID и поддерживает несколько ID через запятую. Каждый ID должен состоять только из цифр.

## Docker

```bash
cp .env.example .env
docker compose up --build
```

SQLite база хранится в локальной директории `data/`, смонтированной в контейнер.

## Управление доступом

1. Пользователь нажимает `/start` и получает статус `PENDING`.
2. `OWNER` или `MANAGER` выполняет `/approve <telegramId>`.
3. `OWNER` может назначить роль командой `/role <telegramId> manager|employee`.
4. Меню в `/start` и `/me` строится на основе роли и статуса пользователя.
