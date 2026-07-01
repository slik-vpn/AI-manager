import type { User as TelegramUser } from 'telegraf/types';
import type { User } from '@prisma/client';
import { EventLevel, Role, UserStatus } from './domain.js';
import { prisma } from './db.js';
import { config } from './config.js';

export function isOwnerTelegramId(telegramId: bigint): boolean {
  return config.ownerTelegramIds.includes(telegramId.toString());
}

export async function findOrCreateUser(from: TelegramUser): Promise<User> {
  const telegramId = BigInt(from.id);
  const owner = isOwnerTelegramId(telegramId);

  const user = await prisma.user.upsert({
    where: { telegramId },
    update: {
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
      ...(owner ? { role: Role.OWNER, status: UserStatus.ACTIVE } : {}),
    },
    create: {
      telegramId,
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
      role: owner ? Role.OWNER : Role.EMPLOYEE,
      status: owner ? UserStatus.ACTIVE : UserStatus.PENDING,
    },
  });

  await logEvent(EventLevel.INFO, `User ${user.telegramId.toString()} opened bot`, user.id);
  return user;
}

export async function logEvent(level: EventLevel, message: string, userId?: number, metadata?: unknown): Promise<void> {
  await prisma.eventLog.create({
    data: {
      level,
      message,
      userId,
      metadata: metadata === undefined ? undefined : JSON.parse(JSON.stringify(metadata)),
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
