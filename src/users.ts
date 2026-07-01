import type { User as TelegramUser } from 'telegraf/types';
import type { User } from '@prisma/client';
import { EventLevel, EventType, Role, UserStatus } from './domain.js';
import { prisma } from './db.js';
import { config } from './config.js';

export function isOwnerTelegramId(telegramId: bigint): boolean {
  return config.ownerTelegramIds.includes(telegramId.toString());
}

export async function findOrCreateUser(from: TelegramUser): Promise<User> {
  const telegramId = BigInt(from.id);
  const owner = isOwnerTelegramId(telegramId);

  const existing = await prisma.user.findUnique({ where: { telegramId } });
  if (existing) {
    return prisma.user.update({
      where: { telegramId },
      data: {
        username: from.username,
        firstName: from.first_name,
        lastName: from.last_name,
        ...(owner ? { role: Role.OWNER, status: UserStatus.ACTIVE } : {}),
      },
    });
  }

  const user = await prisma.user.create({
    data: {
      telegramId,
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
      role: owner ? Role.OWNER : Role.EMPLOYEE,
      status: owner ? UserStatus.ACTIVE : UserStatus.PENDING,
    },
  });

  await logEvent({
    type: EventType.USER_REGISTERED,
    level: EventLevel.INFO,
    message: `User ${user.telegramId.toString()} registered`,
    userId: user.id,
  });
  return user;
}

type LogEventInput = {
  type: EventType;
  level: EventLevel;
  message: string;
  userId?: number;
  metadata?: unknown;
};

export async function logEvent({ type, level, message, userId, metadata }: LogEventInput): Promise<void> {
  await prisma.eventLog.create({
    data: {
      type,
      level,
      message,
      userId,
      metadata: metadata === undefined ? undefined : JSON.stringify(metadata),
    },
  });
}

export function canManageUsers(user?: User): boolean {
  return user?.status === UserStatus.ACTIVE && (user.role === Role.OWNER || user.role === Role.MANAGER);
}

export function canAssignRoles(user?: User): boolean {
  return user?.status === UserStatus.ACTIVE && user.role === Role.OWNER;
}

export function activeOnlyMessage(user?: User): string | null {
  if (!user) return 'Нажмите /start для регистрации.';
  if (user.status === UserStatus.PENDING) return 'Ваш доступ ожидает подтверждения менеджером или владельцем.';
  if (user.status === UserStatus.ARCHIVED) return 'Ваш доступ архивирован. Обратитесь к владельцу.';
  return null;
}
