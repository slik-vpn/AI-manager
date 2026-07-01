import { createBot } from './bot.js';
import { assertConfig, config } from './config.js';

async function main(): Promise<void> {
  assertConfig();
  const bot = createBot(config.botToken);

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  await bot.launch();
  console.log('AI Управляющий SLIK Place bot started');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
