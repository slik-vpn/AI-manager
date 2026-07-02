import type { Shift, ShiftResponse, User } from '@prisma/client';
import { EventLevel, EventType, Role, ShiftPhotoType, ShiftResponseType, ShiftStatus, UserStatus } from './domain.js';
import { prisma } from './db.js';
import { logEvent } from './users.js';

export function canCreateShifts(user?: User): boolean {
  return user?.status === UserStatus.ACTIVE && (user.role === Role.OWNER || user.role === Role.MANAGER);
}

export function canAssignShifts(user?: User): boolean {
  return user?.status === UserStatus.ACTIVE && user.role === Role.OWNER;
}

export function startOfCurrentWeek(date = new Date()): Date {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function endOfCurrentWeek(date = new Date()): Date {
  const end = startOfCurrentWeek(date);
  end.setDate(end.getDate() + 7);
  return end;
}

export function parseCreateShiftCommand(text: string): { date: Date; startsAt: Date; endsAt: Date; title: string } | null {
  const match = text.trim().match(/^\/create_shift\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(.+)$/u);
  if (!match) return null;

  const [, datePart, startsAtPart, endsAtPart, title] = match;
  const date = parseDateTime(datePart, '00:00');
  const startsAt = parseDateTime(datePart, startsAtPart);
  let endsAt = parseDateTime(datePart, endsAtPart);

  if (!date || !startsAt || !endsAt || !title.trim()) return null;
  if (endsAt <= startsAt) {
    endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);
  }

  return { date, startsAt, endsAt, title: title.trim() };
}

function parseDateTime(datePart: string, timePart: string): Date | null {
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  if (!year || !month || !day || hour === undefined || minute === undefined) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) {
    return null;
  }
  return date;
}

export function shiftIdFromText(text: string): number | null {
  const [, rawId] = text.trim().split(/\s+/);
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function assignShiftArgsFromText(text: string): { shiftId: number; telegramId: bigint } | null {
  const [, rawShiftId, rawTelegramId] = text.trim().split(/\s+/);
  const shiftId = Number(rawShiftId);
  if (!Number.isInteger(shiftId) || shiftId <= 0 || !rawTelegramId || !/^\d+$/.test(rawTelegramId)) return null;
  return { shiftId, telegramId: BigInt(rawTelegramId) };
}

export function formatShift(shift: Shift): string {
  return [`#${shift.id} ${shift.title}`, `Дата: ${formatDate(shift.date)}`, `Время: ${formatTime(shift.startsAt)}–${formatTime(shift.endsAt)}`, `Статус: ${shift.status}`].join(' | ');
}

export function statusAfterPhoto(type: ShiftPhotoType): ShiftStatus {
  if (type === ShiftPhotoType.START) return ShiftStatus.STARTED;
  if (type === ShiftPhotoType.READY) return ShiftStatus.READY;
  return ShiftStatus.COMPLETED;
}

export function eventTypeAfterPhoto(type: ShiftPhotoType): EventType {
  if (type === ShiftPhotoType.START) return EventType.SHIFT_STARTED;
  if (type === ShiftPhotoType.READY) return EventType.SHIFT_READY;
  return EventType.SHIFT_COMPLETED;
}

export function expectedStatusBeforePhoto(type: ShiftPhotoType): ShiftStatus[] {
  if (type === ShiftPhotoType.START) return [ShiftStatus.ASSIGNED];
  if (type === ShiftPhotoType.READY) return [ShiftStatus.STARTED];
  return [ShiftStatus.READY];
}

export function shiftPhotoPrompt(type: ShiftPhotoType, shiftId: number): string {
  if (type === ShiftPhotoType.START) return `Отправьте фото начала смены #${shiftId}. Смена начнется только после фото.`;
  if (type === ShiftPhotoType.READY) return `Отправьте фото готовности площадки для смены #${shiftId}.`;
  return `Отправьте фото конца смены #${shiftId}. Смена завершится только после фото.`;
}

export function shiftPhotoSavedMessage(type: ShiftPhotoType, shiftId: number): string {
  if (type === ShiftPhotoType.START) return `Фото начала смены #${shiftId} сохранено. Статус: ${ShiftStatus.STARTED}.`;
  if (type === ShiftPhotoType.READY) return `Фото готовности смены #${shiftId} сохранено. Статус: ${ShiftStatus.READY}.`;
  return `Фото конца смены #${shiftId} сохранено. Статус: ${ShiftStatus.COMPLETED}.`;
}

export function formatResponse(response: ShiftResponse & { user: User }): string {
  const name = response.user.username ? `@${response.user.username}` : response.user.firstName ?? 'без имени';
  return `${response.response}: ${response.user.telegramId.toString()} — ${name}`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(date);
}

export async function createShift(input: { title: string; date: Date; startsAt: Date; endsAt: Date; actor: User }): Promise<Shift> {
  const shift = await prisma.shift.create({
    data: {
      title: input.title,
      date: input.date,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: ShiftStatus.OPEN,
    },
  });

  await logEvent({
    type: EventType.SHIFT_CREATED,
    level: EventLevel.INFO,
    message: `Shift ${shift.id} created`,
    userId: input.actor.id,
    metadata: { shiftId: shift.id },
  });
  return shift;
}

export async function createShiftResponse(shift: Shift, user: User, response: ShiftResponseType): Promise<ShiftResponse> {
  const created = await prisma.shiftResponse.upsert({
    where: { shiftId_userId: { shiftId: shift.id, userId: user.id } },
    create: { shiftId: shift.id, userId: user.id, response },
    update: { response },
  });
  await logEvent({
    type: EventType.SHIFT_RESPONSE_CREATED,
    level: EventLevel.INFO,
    message: `Shift response ${response} saved for shift ${shift.id}`,
    userId: user.id,
    metadata: { shiftId: shift.id, response },
  });
  return created;
}

export async function assignShift(shift: Shift, employee: User, actor: User): Promise<Shift> {
  const updated = await prisma.shift.update({ where: { id: shift.id }, data: { status: ShiftStatus.ASSIGNED, assignedUserId: employee.id } });
  await logEvent({
    type: EventType.SHIFT_ASSIGNED,
    level: EventLevel.INFO,
    message: `Shift ${shift.id} assigned to user ${employee.id}`,
    userId: actor.id,
    metadata: { shiftId: shift.id, assignedUserId: employee.id, assignedTelegramId: employee.telegramId.toString() },
  });
  return updated;
}

export type ShiftReportInput = {
  shiftId: number;
  userId: number;
  guestsCount: number | null;
  hadProblems: boolean;
  hadDamage: boolean;
  hadConflict: boolean;
  comment: string | null;
};

export function parseGuestsCount(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '-' || trimmed.toLowerCase() === 'нет') return null;
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

export function parseYesNo(text: string): boolean | null {
  const normalized = text.trim().toLowerCase();
  if (['да', 'д', 'yes', 'y'].includes(normalized)) return true;
  if (['нет', 'н', 'no', 'n'].includes(normalized)) return false;
  return null;
}

export function normalizeReportComment(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed === '-' || trimmed.toLowerCase() === 'нет') return null;
  return trimmed;
}

export async function createShiftReportAndClose(input: ShiftReportInput) {
  return prisma.$transaction(async (tx) => {
    const report = await tx.shiftReport.create({
      data: {
        shiftId: input.shiftId,
        userId: input.userId,
        guestsCount: input.guestsCount,
        hadProblems: input.hadProblems,
        hadDamage: input.hadDamage,
        hadConflict: input.hadConflict,
        comment: input.comment,
      },
    });
    const shift = await tx.shift.update({
      where: { id: input.shiftId },
      data: { status: ShiftStatus.CLOSED },
    });
    await tx.eventLog.create({
      data: {
        type: EventType.SHIFT_REPORT_CREATED,
        level: EventLevel.INFO,
        message: `Shift report ${report.id} created for shift ${input.shiftId}`,
        userId: input.userId,
        metadata: JSON.stringify({ shiftId: input.shiftId, reportId: report.id }),
      },
    });
    await tx.eventLog.create({
      data: {
        type: EventType.SHIFT_CLOSED,
        level: EventLevel.INFO,
        message: `Shift ${input.shiftId} closed after report`,
        userId: input.userId,
        metadata: JSON.stringify({ shiftId: input.shiftId, reportId: report.id }),
      },
    });
    return { report, shift };
  });
}

export function formatShiftReport(report: { id: number; shiftId: number; user: User; guestsCount: number | null; hadProblems: boolean; hadDamage: boolean; hadConflict: boolean; comment: string | null; createdAt: Date }): string {
  const name = report.user.username ? `@${report.user.username}` : report.user.firstName ?? 'без имени';
  const yesNo = (value: boolean) => (value ? 'да' : 'нет');
  return [
    `Отчет по смене #${report.shiftId} (отчет #${report.id})`,
    `Сотрудник: ${report.user.telegramId.toString()} — ${name}`,
    `Количество гостей: ${report.guestsCount ?? 'не указано'}`,
    `Были проблемы: ${yesNo(report.hadProblems)}`,
    `Были повреждения: ${yesNo(report.hadDamage)}`,
    `Был конфликт: ${yesNo(report.hadConflict)}`,
    `Комментарий: ${report.comment ?? 'нет'}`,
    `Создан: ${formatDate(report.createdAt)} ${formatTime(report.createdAt)}`,
  ].join('\n');
}
