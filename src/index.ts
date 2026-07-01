import { EventLevel, EventType } from './domain.js';
import { createBot } from './bot.js';
import { assertConfig, config } from './config.js';
import { logEvent } from './users.js';

async function main(): Promise<void> {
  assertConfig();
  const bot = createBot(config.botToken);

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  await bot.launch();
  await logEvent({
    type: EventType.BOT_STARTED,
    level: EventLevel.INFO,
    message: 'AI Управляющий SLIK Place bot started',
  });
  console.log('AI Управляющий SLIK Place bot started');
}

main()
  .catch(async (error: unknown) => {
    console.error(error);
    await logEvent({
      type: EventType.BOT_ERROR,
      level: EventLevel.ALERT,
      message: error instanceof Error ? error.message : 'Unknown bot error',
      metadata: { error: String(error) } as never,
    }).catch((logError: unknown) => console.error('Failed to log bot error', logError));
    process.exitCode = 1;
  });
