import type { User } from '@prisma/client';
import { Role, UserStatus } from './domain.js';

export function roleBasedMenu(user: User): string {
  if (user.status !== UserStatus.ACTIVE) {
    return ['Доступные команды:', '/start — регистрация', '/me — мой профиль'].join('\n');
  }

  const base = [
    'Доступные команды:',
    '/me — мой профиль',
    '/shifts — доступные смены текущей недели',
    '/my_shifts — мои назначенные смены',
    '/take_shift <shiftId> — откликнуться на смену',
    '/decline_shift <shiftId> — отказаться от смены',
    '/start_shift <shiftId> — отправить фото начала назначенной смены',
    '/ready_shift <shiftId> — отправить фото готовности площадки',
    '/end_shift <shiftId> — отправить фото конца смены',
    '/report_shift <shiftId> — заполнить отчет после завершения смены',
    '/my_payroll — моя зарплата по закрытым сменам',
  ];

  if (user.role === Role.MANAGER || user.role === Role.OWNER) {
    base.push(
      '/users — список пользователей',
      '/approve <telegramId> — подтвердить пользователя',
      '/create_shift YYYY-MM-DD HH:mm HH:mm Название смены — создать смену',
    );
  }

  if (user.role === Role.OWNER) {
    base.push(
      '/role <telegramId> manager|employee — изменить роль',
      '/shift_responses <shiftId> — отклики на смену',
      '/assign_shift <shiftId> <telegramId> — назначить сотрудника',
      '/shift_report <shiftId> — посмотреть отчет по смене',
      '/set_sales <shiftId> <amount> — указать продажи по смене',
      '/payroll — зарплаты всех сотрудников',
      '/mark_paid <telegramId> <amount> — отметить выплату',
    );
  }

  return base.join('\n');
}
