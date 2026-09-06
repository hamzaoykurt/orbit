export const FITNESS_SYNC_CAPABILITY = 'fitness_sync';

export type FitnessSummary = {
  weekStartsOn: string;
  timeZone: string;
  weeklyTarget: number;
  completedThisWeek: number;
  today: { name: string | null; status: 'not_scheduled' | 'scheduled' | 'in_progress' | 'completed' };
  lastCompleted: { name: string | null; completedAt: string | null };
  schedule: { dayIndex: number; name: string; isRestDay: boolean }[];
};

export type FitnessSyncEnvelope = {
  orbitAccountId: string;
  fitnessUserId: string;
  summary: FitnessSummary;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS = new Set(['not_scheduled', 'scheduled', 'in_progress', 'completed']);
const text = (value: unknown, max: number) => typeof value === 'string' && value.trim().length <= max ? value.trim() : null;
const nullableText = (value: unknown, max: number) => value === null ? null : text(value, max);
const integer = (value: unknown, min: number, max: number) => Number.isInteger(value) && Number(value) >= min && Number(value) <= max ? Number(value) : null;

export function hasFitnessSyncCapability(value: string | undefined): boolean {
  return new Set((value ?? '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean)).has(FITNESS_SYNC_CAPABILITY);
}

export function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer ([A-Za-z0-9._~+\/-]{16,512})$/);
  return match?.[1] ?? null;
}

export function validLinkState(value: string | null): value is string {
  return Boolean(value && value.length <= 4096 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value));
}

export function parseFitnessSyncEnvelope(value: unknown): FitnessSyncEnvelope | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const accountId = text(body.orbitAccountId, 128), userId = text(body.fitnessUserId, 64);
  if (!accountId || !userId || !UUID.test(userId) || !body.summary || typeof body.summary !== 'object' || Array.isArray(body.summary)) return null;
  const source = body.summary as Record<string, unknown>;
  const weekStartsOn = text(source.weekStartsOn, 10), timeZone = text(source.timeZone, 64);
  const weeklyTarget = integer(source.weeklyTarget, 0, 31), completedThisWeek = integer(source.completedThisWeek, 0, 1000);
  if (!weekStartsOn || !DATE.test(weekStartsOn) || !timeZone || weeklyTarget === null || completedThisWeek === null) return null;
  if (!source.today || typeof source.today !== 'object' || Array.isArray(source.today)) return null;
  const todaySource = source.today as Record<string, unknown>, todayName = nullableText(todaySource.name, 160);
  if ((todaySource.name !== null && todayName === null) || typeof todaySource.status !== 'string' || !STATUS.has(todaySource.status)) return null;
  if (!source.lastCompleted || typeof source.lastCompleted !== 'object' || Array.isArray(source.lastCompleted)) return null;
  const lastSource = source.lastCompleted as Record<string, unknown>, lastName = nullableText(lastSource.name, 160);
  const completedAt = nullableText(lastSource.completedAt, 64);
  if ((lastSource.name !== null && lastName === null) || (lastSource.completedAt !== null && (!completedAt || !Number.isFinite(Date.parse(completedAt))))) return null;
  if (!Array.isArray(source.schedule) || source.schedule.length > 31) return null;
  const schedule: FitnessSummary['schedule'] = [];
  for (const item of source.schedule) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>, dayIndex = integer(row.dayIndex, 0, 6), name = text(row.name, 160);
    if (dayIndex === null || !name || typeof row.isRestDay !== 'boolean') return null;
    schedule.push({ dayIndex, name, isRestDay: row.isRestDay });
  }
  return {
    orbitAccountId: accountId,
    fitnessUserId: userId,
    summary: {
      weekStartsOn, timeZone, weeklyTarget, completedThisWeek,
      today: { name: todayName, status: todaySource.status as FitnessSummary['today']['status'] },
      lastCompleted: { name: lastName, completedAt }, schedule,
    },
  };
}

export async function hmacHex(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
