import type { Context } from 'telegraf';
import type { User } from '@prisma/client';

export interface BotContext extends Context {
  appUser?: User;
}
