import 'dotenv/config';

const rawOwnerTelegramIds = process.env.OWNER_TELEGRAM_IDS;
const ownerTelegramIds = rawOwnerTelegramIds
  ?.split(',')
  .map((id) => id.trim())
  .filter(Boolean) ?? [];

export const config = {
  botToken: process.env.BOT_TOKEN ?? '',
  ownerTelegramIds,
};

export function assertConfig(): void {
  if (!config.botToken) {
    throw new Error('BOT_TOKEN is required. Copy .env.example to .env and set BOT_TOKEN.');
  }

  if (rawOwnerTelegramIds === undefined) {
    throw new Error('OWNER_TELEGRAM_IDS is required. Set at least one numeric Telegram ID.');
  }

  if (ownerTelegramIds.length === 0) {
    throw new Error('OWNER_TELEGRAM_IDS must contain at least one numeric Telegram ID.');
  }

  const invalidOwnerTelegramIds = ownerTelegramIds.filter((id) => !/^\d+$/.test(id));
  if (invalidOwnerTelegramIds.length > 0) {
    throw new Error('OWNER_TELEGRAM_IDS must contain only numeric Telegram IDs separated by commas.');
  }
}
