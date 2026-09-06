import { env } from 'cloudflare:workers';
import { createHash, timingSafeEqual } from 'node:crypto';
import { authenticatedUser } from '../../auth/context';
import { bearerToken, hasFitnessSyncCapability, hmacHex } from './protocol';

type ProFitnessBindings = Cloudflare.Env & {
  ORBIT_PROFITNESS_SERVER_SECRET?: string;
  ORBIT_PROFITNESS_REQUEST_SECRET?: string;
  ORBIT_PROFITNESS_WEBHOOK_SECRET?: string;
  ORBIT_PROFITNESS_CALLBACK_URL?: string;
  ORBIT_PREMIUM_CAPABILITIES?: string;
};

export type ProFitnessLink = {
  fitness_user_id: string;
  orbit_account_id: string;
  status: 'pending' | 'connected' | 'disconnected';
  fitness_sync_entitled: number;
  updated_at: string;
};

const bindings = () => env as ProFitnessBindings;
const fixedHashEqual = (left: string, right: string) => timingSafeEqual(
  createHash('sha256').update(left).digest(),
  createHash('sha256').update(right).digest(),
);
export const database = () => bindings().DB;
export const requiredBinding = (name: keyof ProFitnessBindings): string => {
  const value = bindings()[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing_${String(name).toLowerCase()}`);
  return value.trim();
};

export const isFitnessSyncEntitled = () => hasFitnessSyncCapability(bindings().ORBIT_PREMIUM_CAPABILITIES);
export const orbitAccountLabel = () => authenticatedUser() ? 'Orbit Personal OS' : null;

export async function currentOwnerHash(): Promise<string> {
  const owner = authenticatedUser();
  if (!owner) throw new Error('unauthorized');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`orbit-owner:${owner}`)));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export async function readBoundedBody(request: Request, limit = 64 * 1024): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > limit) return null;
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(output);
}

export async function verifyFitnessServerRequest(request: Request, rawBody: string): Promise<boolean> {
  const token = bearerToken(request.headers.get('authorization'));
  const timestamp = request.headers.get('x-orbit-timestamp') ?? '';
  const signature = request.headers.get('x-orbit-signature')?.replace(/^sha256=/i, '').toLowerCase() ?? '';
  const seconds = Number(timestamp);
  if (!token || !/^\d{10}$/.test(timestamp) || !/^[0-9a-f]{64}$/.test(signature) || !Number.isFinite(seconds)) return false;
  if (Math.abs(Date.now() / 1000 - seconds) > 300) return false;
  const [tokenMatches, expectedSignature] = await Promise.all([
    fixedHashEqual(token, requiredBinding('ORBIT_PROFITNESS_SERVER_SECRET')),
    hmacHex(requiredBinding('ORBIT_PROFITNESS_REQUEST_SECRET'), `${timestamp}.${rawBody}`),
  ]);
  return tokenMatches && fixedHashEqual(signature, expectedSignature);
}

export async function accountId(): Promise<string> {
  const db = database();
  const ownerHash = await currentOwnerHash();
  await db.prepare(`INSERT INTO orbit_profitness_account (singleton, account_id, owner_hash, account_label)
    VALUES (1, ?, ?, 'Orbit Personal OS') ON CONFLICT(singleton) DO NOTHING`).bind(crypto.randomUUID(), ownerHash).run();
  const row = await db.prepare('SELECT account_id FROM orbit_profitness_account WHERE singleton = 1 AND owner_hash = ?')
    .bind(ownerHash).first<{ account_id: string }>();
  if (!row?.account_id) throw new Error('orbit_account_unavailable');
  return row.account_id;
}

export async function linkFor(fitnessUserId: string): Promise<ProFitnessLink | null> {
  return database().prepare(`SELECT fitness_user_id, orbit_account_id, status, fitness_sync_entitled, updated_at
    FROM orbit_profitness_links WHERE fitness_user_id = ?`).bind(fitnessUserId).first<ProFitnessLink>();
}

export async function sendFitnessCallback(body: Record<string, unknown>): Promise<Response> {
  const callbackUrl = requiredBinding('ORBIT_PROFITNESS_CALLBACK_URL');
  const url = new URL(callbackUrl);
  if (url.protocol !== 'https:') throw new Error('invalid_fitness_callback_url');
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await hmacHex(requiredBinding('ORBIT_PROFITNESS_WEBHOOK_SECRET'), `${timestamp}.${raw}`);
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': timestamp,
      'X-Webhook-Signature': `sha256=${signature}`,
    },
    body: raw,
  });
}

export const safeErrorCode = (error: unknown) => error instanceof Error && /^missing_[a-z0-9_]+$/.test(error.message)
  ? 'integration_not_configured' : 'temporarily_unavailable';
