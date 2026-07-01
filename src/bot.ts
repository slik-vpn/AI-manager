import { Telegraf } from 'telegraf';
import { EventLevel, EventType, Role, ShiftResponseType, ShiftStatus, UserStatus } from './domain.js';
import { prisma } from './db.js';
import type { BotContext } from './types.js';
import { activeOnlyMessage, canAssignRoles, canManageUsers, findOrCreateUser, logEvent } from './users.js';
import { roleBasedMenu } from './menu.js';
import { assignShift, assignShiftArgsFromText, canAssignShifts, canCreateShifts, createShift, createShiftResponse, endOfCurrentWeek, formatResponse, formatShift, parseCreateShiftCommand, shiftIdFromText, startOfCurrentWeek } from './shifts.js';

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


  bot.command('shifts', async (ctx) => {
    const blocked = activeOnlyMessage(ctx.appUser);
    if (blocked) return ctx.reply(blocked);

    const where = ctx.appUser?.role === Role.OWNER
      ? {}
      : { status: ShiftStatus.OPEN, startsAt: { gte: startOfCurrentWeek(), lt: endOfCurrentWeek() } };

    const shifts = await prisma.shift.findMany({ where, orderBy: [{ startsAt: 'asc' }] });
    if (shifts.length === 0) return ctx.reply('Доступных смен нет.');

    await ctx.reply(['Доступные смены:', ...shifts.map(formatShift)].join('\n'));
  });

  bot.command('my_shifts', async (ctx) => {
    const blocked = activeOnlyMessage(ctx.appUser);
    if (blocked) return ctx.reply(blocked);

    const shifts = await prisma.shift.findMany({
      where: { assignedUserId: ctx.appUser?.id },
      orderBy: [{ startsAt: 'asc' }],
    });
    if (shifts.length === 0) return ctx.reply('У вас нет назначенных смен.');

    await ctx.reply(['Мои смены:', ...shifts.map(formatShift)].join('\n'));
  });

  bot.command('create_shift', async (ctx) => {
    const blocked = activeOnlyMessage(ctx.appUser);
    if (blocked) return ctx.reply(blocked);
    if (!canCreateShifts(ctx.appUser)) return ctx.reply('Недостаточно прав для создания смен.');

    const parsed = parseCreateShiftCommand(ctx.message.text);
    if (!parsed || !ctx.appUser) return ctx.reply('Использование: /create_shift YYYY-MM-DD HH:mm HH:mm Название смены');

    const shift = await createShift({ ...parsed, actor: ctx.appUser });
    await ctx.reply(['Смена создана:', formatShift(shift)].join('\n'));
  });

  bot.command('take_shift', async (ctx) => {
    const blocked = activeOnlyMessage(ctx.appUser);
    if (blocked) return ctx.reply(blocked);

    const shiftId = shiftIdFromText(ctx.message.text);
    if (!shiftId || !ctx.appUser) return ctx.reply('Использование: /take_shift <shiftId>');

    const shift = await prisma.shift.findFirst({
      where: {
        id: shiftId,
        status: ShiftStatus.OPEN,
        ...(ctx.appUser.role === Role.OWNER ? {} : { startsAt: { gte: startOfCurrentWeek(), lt: endOfCurrentWeek() } }),
      },
    });
    if (!shift) return ctx.reply('Открытая смена не найдена.');

    await createShiftResponse(shift, ctx.appUser, ShiftResponseType.TAKE);
    await ctx.reply(`Отклик TAKE на смену #${shift.id} сохранен.`);
  });

  bot.command('decline_shift', async (ctx) => {
    const blocked = activeOnlyMessage(ctx.appUser);
    if (blocked) return ctx.reply(blocked);

    const shiftId = shiftIdFromText(ctx.message.text);
    if (!shiftId || !ctx.appUser) return ctx.reply('Использование: /decline_shift <shiftId>');

    const shift = await prisma.shift.findFirst({
      where: {
        id: shiftId,
        status: ShiftStatus.OPEN,
        ...(ctx.appUser.role === Role.OWNER ? {} : { startsAt: { gte: startOfCurrentWeek(), lt: endOfCurrentWeek() } }),
      },
    });
    if (!shift) return ctx.reply('Открытая смена не найдена.');

    await createShiftResponse(shift, ctx.appUser, ShiftResponseType.DECLINE);
    await ctx.reply(`Отклик DECLINE на смену #${shift.id} сохранен.`);
  });

  bot.command('shift_responses', async (ctx) => {
    const blocked = activeOnlyMessage(ctx.appUser);
    if (blocked) return ctx.reply(blocked);
    if (!canAssignShifts(ctx.appUser)) return ctx.reply('Только OWNER может смотреть отклики смен.');

    const shiftId = shiftIdFromText(ctx.message.text);
    if (!shiftId) return ctx.reply('Использование: /shift_responses <shiftId>');

    const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) return ctx.reply('Смена не найдена.');

    const responses = await prisma.shiftResponse.findMany({
      where: { shiftId },
      include: { user: true },
      orderBy: [{ createdAt: 'asc' }],
    });
    if (responses.length === 0) return ctx.reply(`Откликов на смену #${shiftId} пока нет.`);

    await ctx.reply([`Отклики на смену #${shiftId}:`, ...responses.map(formatResponse)].join('\n'));
  });

  bot.command('assign_shift', async (ctx) => {
    const blocked = activeOnlyMessage(ctx.appUser);
    if (blocked) return ctx.reply(blocked);
    if (!canAssignShifts(ctx.appUser)) return ctx.reply('Только OWNER может назначать сотрудников на смены.');

    const args = assignShiftArgsFromText(ctx.message.text);
    if (!args || !ctx.appUser) return ctx.reply('Использование: /assign_shift <shiftId> <telegramId>');

    const [shift, employee] = await Promise.all([
      prisma.shift.findUnique({ where: { id: args.shiftId } }),
      prisma.user.findUnique({ where: { telegramId: args.telegramId } }),
    ]);
    if (!shift) return ctx.reply('Смена не найдена.');
    if (!employee || employee.status !== UserStatus.ACTIVE) return ctx.reply('Активный сотрудник не найден.');

    const updated = await assignShift(shift, employee, ctx.appUser);
    await ctx.reply(`Смена #${updated.id} назначена пользователю ${employee.telegramId.toString()}.`);
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
