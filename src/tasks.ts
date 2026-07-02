import type { Task, User } from '@prisma/client';
import { EventLevel, EventType, Role, TaskStatus, UserStatus } from './domain.js';
import { prisma } from './db.js';
import { logEvent } from './users.js';

export type PendingTask = {
  step: 'title' | 'description' | 'assignee' | 'dueAt' | 'requiresPhoto';
  title?: string;
  description?: string | null;
  assigneeId?: number | null;
  dueAt?: Date | null;
};

export type PendingTaskPhoto = {
  taskId: number;
};

export function canCreateTasks(user?: User): boolean {
  return user?.status === UserStatus.ACTIVE && (user.role === Role.OWNER || user.role === Role.MANAGER);
}

export function canConfirmTasks(user?: User): boolean {
  return canCreateTasks(user);
}

export function canViewAllTasks(user?: User): boolean {
  return canCreateTasks(user);
}

export function parseTaskIdFromText(text: string): number | null {
  const [, rawId] = text.trim().split(/\s+/);
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function normalizeOptionalText(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '-') return null;
  return trimmed.length > 0 ? trimmed : null;
}

export function parseDueAt(text: string): Date | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '-') return null;
  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function parseYesNo(text: string): boolean | null {
  const normalized = text.trim().toLowerCase();
  if (['yes', 'y', 'да', 'д'].includes(normalized)) return true;
  if (['no', 'n', 'нет', 'н'].includes(normalized)) return false;
  return null;
}

export async function findActiveTaskAssigneeByTelegramId(rawTelegramId: string): Promise<User | null> {
  if (!/^\d+$/.test(rawTelegramId)) return null;
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(rawTelegramId) } });
  if (!user || user.status !== UserStatus.ACTIVE || ![Role.EMPLOYEE, Role.MANAGER].includes(user.role as Role)) return null;
  return user;
}

export function formatTask(task: Task & { assignee?: User | null; createdBy?: User }): string {
  const assignee = task.assignee
    ? `${task.assignee.telegramId.toString()} — ${task.assignee.username ? `@${task.assignee.username}` : task.assignee.firstName ?? 'без имени'}`
    : 'не назначен';
  const creator = task.createdBy
    ? `${task.createdBy.telegramId.toString()} — ${task.createdBy.username ? `@${task.createdBy.username}` : task.createdBy.firstName ?? 'без имени'}`
    : `userId ${task.createdById}`;

  return [
    `#${task.id} ${task.title} — ${task.status}`,
    `Исполнитель: ${assignee}`,
    `Создал: ${creator}`,
    `Срок: ${task.dueAt ? task.dueAt.toISOString() : 'не указан'}`,
    `Фото: ${task.requiresPhoto ? (task.photoFileId ? 'есть' : 'требуется') : 'не требуется'}`,
    task.description ? `Описание: ${task.description}` : null,
  ].filter(Boolean).join(' | ');
}

export async function createTask(input: {
  title: string;
  description?: string | null;
  assigneeId?: number | null;
  createdById: number;
  dueAt?: Date | null;
  requiresPhoto: boolean;
}): Promise<Task> {
  const task = await prisma.task.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      assigneeId: input.assigneeId ?? null,
      createdById: input.createdById,
      status: TaskStatus.OPEN,
      dueAt: input.dueAt ?? null,
      requiresPhoto: input.requiresPhoto,
    },
  });

  await logEvent({
    type: EventType.TASK_CREATED,
    level: EventLevel.INFO,
    message: `Task ${task.id} created`,
    userId: input.createdById,
    metadata: { taskId: task.id, assigneeId: task.assigneeId, requiresPhoto: task.requiresPhoto },
  });

  return task;
}

export async function updateTaskStatus(task: Task, status: TaskStatus, actor: User, eventType: EventType): Promise<Task> {
  const updated = await prisma.task.update({ where: { id: task.id }, data: { status } });
  await logEvent({
    type: eventType,
    level: EventLevel.INFO,
    message: `Task ${task.id} status changed to ${status}`,
    userId: actor.id,
    metadata: { taskId: task.id, previousStatus: task.status, status },
  });
  return updated;
}
