import type { Incident, User } from '@prisma/client';
import { EventLevel, EventType, IncidentCategory, IncidentStatus, Role, UserStatus } from './domain.js';
import { prisma } from './db.js';
import { logEvent } from './users.js';

export const incidentCategories = Object.values(IncidentCategory);

export type PendingIncident = {
  step: 'category' | 'description' | 'photo';
  category?: IncidentCategory;
  description?: string;
};

export function canViewAllIncidents(user?: User): boolean {
  return user?.status === UserStatus.ACTIVE && (user.role === Role.OWNER || user.role === Role.MANAGER);
}

export function canResolveIncidents(user?: User): boolean {
  return canViewAllIncidents(user);
}

export function parseIncidentCategory(text: string): IncidentCategory | null {
  const normalized = text.trim().toUpperCase();
  return incidentCategories.includes(normalized as IncidentCategory) ? normalized as IncidentCategory : null;
}

export function parseIncidentIdFromText(text: string): number | null {
  const [, rawId] = text.trim().split(/\s+/);
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function formatIncidentCategoryPrompt(): string {
  return ['Выберите категорию инцидента:', ...incidentCategories.map((category) => `- ${category}`)].join('\n');
}

export function normalizeIncidentDescription(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function formatIncident(incident: Incident & { user?: User }): string {
  const author = incident.user
    ? `${incident.user.telegramId.toString()} — ${incident.user.username ? `@${incident.user.username}` : incident.user.firstName ?? 'без имени'}`
    : `userId ${incident.userId}`;

  return [
    `#${incident.id} ${incident.category} — ${incident.status}`,
    `Автор: ${author}`,
    `Смена: ${incident.shiftId ?? 'не указана'}`,
    `Описание: ${incident.description}`,
    `Фото: ${incident.photoFileId ? 'есть' : 'нет'}`,
  ].join(' | ');
}

export async function createIncident(input: { userId: number; category: IncidentCategory; description: string; photoFileId?: string | null }): Promise<Incident> {
  const incident = await prisma.incident.create({
    data: {
      userId: input.userId,
      category: input.category,
      description: input.description,
      status: IncidentStatus.OPEN,
      photoFileId: input.photoFileId ?? null,
    },
  });

  await logEvent({
    type: EventType.INCIDENT_CREATED,
    level: EventLevel.WARNING,
    message: `Incident ${incident.id} created`,
    userId: input.userId,
    metadata: { incidentId: incident.id, category: incident.category, hasPhoto: Boolean(incident.photoFileId) },
  });

  return incident;
}

export async function resolveIncident(incidentId: number, actor: User): Promise<Incident | null> {
  const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!incident) return null;
  if (incident.status === IncidentStatus.RESOLVED) return incident;

  const updated = await prisma.incident.update({
    where: { id: incidentId },
    data: { status: IncidentStatus.RESOLVED },
  });

  await logEvent({
    type: EventType.INCIDENT_RESOLVED,
    level: EventLevel.INFO,
    message: `Incident ${incidentId} resolved`,
    userId: actor.id,
    metadata: { incidentId, previousStatus: incident.status },
  });

  return updated;
}
