import { config } from './config.js';

type YClientsConfig = {
  apiBaseUrl: string;
  partnerToken: string;
  companyId: string;
  userToken?: string;
  isConfigured: boolean;
  missing: string[];
};

type YClientsRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  searchParams?: Record<string, string | number | boolean | undefined>;
};

export type YClientsItem = Record<string, unknown>;

const DEFAULT_TAKE = 5;

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function extractItems(payload: unknown): YClientsItem[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];

  const data = payload.data;
  if (Array.isArray(data)) return data.filter(isRecord);
  if (isRecord(data)) {
    for (const key of ['items', 'records', 'bookings', 'sales']) {
      const value = data[key];
      if (Array.isArray(value)) return value.filter(isRecord);
    }
  }

  for (const key of ['items', 'records', 'bookings', 'sales']) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }

  return [];
}

function isRecord(value: unknown): value is YClientsItem {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getYClientsConfig(): YClientsConfig {
  const apiBaseUrl = normalizeBaseUrl(config.yclients.apiBaseUrl);
  const partnerToken = config.yclients.partnerToken.trim();
  const companyId = config.yclients.companyId.trim();
  const userToken = config.yclients.userToken.trim() || undefined;
  const missing = [
    ['YCLIENTS_API_BASE_URL', apiBaseUrl],
    ['YCLIENTS_PARTNER_TOKEN', partnerToken],
    ['YCLIENTS_COMPANY_ID', companyId],
  ].filter(([, value]) => !value).map(([name]) => name);

  return {
    apiBaseUrl,
    partnerToken,
    companyId,
    userToken,
    missing,
    isConfigured: missing.length === 0,
  };
}

export async function yclientsRequest(path: string, options: YClientsRequestOptions = {}): Promise<unknown> {
  const yclientsConfig = getYClientsConfig();
  if (!yclientsConfig.isConfigured) {
    throw new Error(`YClients is not configured. Missing: ${yclientsConfig.missing.join(', ')}`);
  }

  const url = new URL(`${yclientsConfig.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(options.searchParams ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const bearerTokens = yclientsConfig.userToken
    ? `${yclientsConfig.partnerToken}, User ${yclientsConfig.userToken}`
    : yclientsConfig.partnerToken;

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/vnd.yclients.v2+json',
      Authorization: `Bearer ${bearerTokens}`,
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) as unknown : null;

  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.meta === 'object'
      ? JSON.stringify(payload.meta)
      : text || response.statusText;
    throw new Error(`YClients request failed: ${response.status} ${message}`);
  }

  return payload;
}

export async function fetchYClientsBookings(take = DEFAULT_TAKE): Promise<YClientsItem[]> {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 30);

  const payload = await yclientsRequest(`/records/${getYClientsConfig().companyId}`, {
    searchParams: {
      start_date: dateOnly(start),
      end_date: dateOnly(end),
      count: take,
    },
  });

  return extractItems(payload).slice(0, take);
}

export async function fetchYClientsSales(take = DEFAULT_TAKE): Promise<YClientsItem[]> {
  const payload = await yclientsRequest(`/company/${getYClientsConfig().companyId}/sale`, {
    searchParams: { count: take },
  });

  return extractItems(payload).slice(0, take);
}

export function formatYClientsItems(items: YClientsItem[], emptyMessage: string): string {
  if (items.length === 0) return emptyMessage;

  return items.map((item, index) => {
    const id = valueAsString(item.id) ?? valueAsString(item.record_id) ?? valueAsString(item.visit_id) ?? `#${index + 1}`;
    const date = valueAsString(item.date) ?? valueAsString(item.datetime) ?? valueAsString(item.create_date) ?? valueAsString(item.created_at) ?? 'без даты';
    const title = valueAsString(item.title) ?? valueAsString(item.service_title) ?? valueAsString(item.comment) ?? 'без названия';
    const client = clientName(item.client) ?? valueAsString(item.client_name) ?? valueAsString(item.phone) ?? 'клиент не указан';
    const amount = valueAsString(item.amount) ?? valueAsString(item.cost) ?? valueAsString(item.price) ?? valueAsString(item.paid_full_amount);
    return [`${index + 1}. ${date}`, `ID: ${id}`, title, client, amount ? `сумма: ${amount}` : undefined].filter(Boolean).join(' — ');
  }).join('\n');
}

function clientName(client: unknown): string | null {
  if (!isRecord(client)) return null;
  return valueAsString(client.name) ?? valueAsString(client.phone);
}

function valueAsString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return null;
}
