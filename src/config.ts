import 'dotenv/config';

export const config = {
  botToken: process.env.BOT_TOKEN ?? '',
  ownerTelegramIds: (process.env.OWNER_TELEGRAM_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
};

export function assertConfig(): void {
  if (!config.botToken) {
    throw new Error('BOT_TOKEN is required. Copy .env.example to .env and set BOT_TOKEN.');
  }
}
