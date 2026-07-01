import { Telegraf } from 'telegraf';
import { EventLevel, EventType, Role, UserStatus } from './domain.js';
import { prisma } from './db.js';
import type { BotContext } from './types.js';
import { activeOnlyMessage, canAssignRoles, canManageUsers, findOrCreateUser, logEvent } from './users.js';
import { roleBasedMenu } from './menu.js';

function formatUser(user: { telegramId: bigint; username: string | null; firstName: string | null; role: string; status: string }): string {
  const name = user.username ? `@${user.username}` : user.firstName ?? 'без имени';
  return `${user.telegramId.toString()} — ${name} — ${user.role} — ${user.status}`;
}

function telegramIdFromText(text: string): bigint | null {
  const [, rawId] = text.trim().split(/\s+/);
  if (!rawId || !/^\d+$/.test(rawId)) return null;
  return BigInt(rawId);
}

export function createBot(token: string): Telegraf<BotContext> {
  const bot = new Telegraf<BotContext>(token);

  bot.use(async (ctx, next) => {
    if (ctx.from) {
      ctx.appUser = await findOrCreateUser(ctx.from);
    }
    await next();
  });

  bot.start(async (ctx) => {
    const user = ctx.appUser;
    if (!user) return;

    await ctx.reply([
      'Добро пожаловать в AI Управляющий SLIK Place.',
      `Ваш статус: ${user.status}. Роль: ${user.role}.`,
      roleBasedMenu(user),
    ].join('\n\n'));
  });

  bot.command('me', async (ctx) => {
    const user = ctx.appUser;
    if (!user) return ctx.reply('Нажмите /start для регистрации.');

    await ctx.reply([
      'Ваш профиль:',
      `Telegram ID: ${user.telegramId.toString()}`,
      `Роль: ${user.role}`,
      `Статус: ${user.status}`,
      roleBasedMenu(user),
    ].join('\n'));
  });

  bot.command('users', async (ctx) => {
    const blocked = activeOnlyMessage(ctx.appUser);
    if (blocked) return ctx.reply(blocked);
    if (!canManageUsers(ctx.appUser)) return ctx.reply('Недостаточно прав для просмотра пользователей.');

    const users = await prisma.user.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 50 });
    if (users.length === 0) return ctx.reply('Пользователей пока нет.');

    await ctx.reply(['Пользователи:', ...users.map(formatUser)].join('\n'));
  });

  bot.command('approve', async (ctx) => {
    const blocked = activeOnlyMessage(ctx.appUser);
    if (blocked) return ctx.reply(blocked);
    if (!canManageUsers(ctx.appUser)) return ctx.reply('Недостаточно прав для подтверждения пользователей.');

    const telegramId = telegramIdFromText(ctx.message.text);
    if (!telegramId) return ctx.reply('Использование: /approve <telegramId>');

    const updated = await prisma.user.update({
      where: { telegramId },
      data: { status: UserStatus.ACTIVE },
    }).catch(() => null);

    if (!updated) return ctx.reply('Пользователь не найден. Сначала он должен нажать /start.');

    await logEvent({
      type: EventType.USER_APPROVED,
      level: EventLevel.INFO,
      message: `User ${updated.telegramId.toString()} approved`,
      userId: ctx.appUser?.id,
      metadata: { targetUserId: updated.id },
    });
    await ctx.reply(`Пользователь ${updated.telegramId.toString()} подтвержден.`);
  });

  bot.command('role', async (ctx) => {
    const blocked = activeOnlyMessage(ctx.appUser);
    if (blocked) return ctx.reply(blocked);
    if (!canAssignRoles(ctx.appUser)) return ctx.reply('Только OWNER может менять роли.');

    const [, rawId, rawRole] = ctx.message.text.trim().split(/\s+/);
    if (!rawId || !/^\d+$/.test(rawId) || !rawRole || !['manager', 'employee'].includes(rawRole)) {
      return ctx.reply('Использование: /role <telegramId> manager|employee');
    }

    const role = rawRole === 'manager' ? Role.MANAGER : Role.EMPLOYEE;
    const updated = await prisma.user.update({
      where: { telegramId: BigInt(rawId) },
      data: { role },
    }).catch(() => null);

    if (!updated) return ctx.reply('Пользователь не найден. Сначала он должен нажать /start.');

    await logEvent({
      type: EventType.ROLE_CHANGED,
      level: EventLevel.WARNING,
      message: `Role for ${updated.telegramId.toString()} changed to ${role}`,
      userId: ctx.appUser?.id,
      metadata: { targetUserId: updated.id },
    });
    await ctx.reply(`Роль пользователя ${updated.telegramId.toString()} изменена на ${role}.`);
  });

  return bot;
}
