import type { User } from '@prisma/client';
import { Role, UserStatus } from './domain.js';

export function roleBasedMenu(user: User): string {
  if (user.status !== UserStatus.ACTIVE) {
    return ['Доступные команды:', '/start — регистрация', '/me — мой профиль'].join('\n');
  }

  const base = ['Доступные команды:', '/me — мой профиль'];

  if (user.role === Role.MANAGER || user.role === Role.OWNER) {
    base.push('/users — список пользователей', '/approve <telegramId> — подтвердить пользователя');
  }

  if (user.role === Role.OWNER) {
    base.push('/role <telegramId> manager|employee — изменить роль');
  }

  return base.join('\n');
}
