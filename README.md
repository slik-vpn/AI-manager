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
- Типы событий: `USER_REGISTERED`, `USER_APPROVED`, `ROLE_CHANGED`, `BOT_STARTED`, `BOT_ERROR`.
- Модели Prisma: `User`, `EventLog` с обязательным `type`, `level`, `message`, `createdAt` и опциональными `metadata`, `userId`.
- Команды Telegram:
  - `/start` — регистрация и меню по роли.
  - `/me` — профиль текущего пользователя.
  - `/users` — список пользователей для `OWNER` и `MANAGER`.
  - `/approve <telegramId>` — подтверждение пользователя для `OWNER` и `MANAGER`.
  - `/role <telegramId> manager|employee` — смена роли для `OWNER`.

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
