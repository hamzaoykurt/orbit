import { Buffer } from 'node:buffer';
import { getDatabase } from '../../db/client';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

type CredentialRow = {
  refresh_token_ciphertext: string;
  refresh_token_iv: string;
  calendar_id: string;
};

export class GoogleCalendarError extends Error {
  constructor(message: string, public readonly status = 500, public readonly reconnect = false) {
    super(message);
  }
}

export function googleCalendarConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
    || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim()
    || '';
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || '';
  const encryptionSecret = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim() || '';
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim()
    || process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_ID?.trim()
    || 'primary';
  return { clientId, clientSecret, encryptionSecret, calendarId, configured: Boolean(clientId && clientSecret && encryptionSecret) };
}

export async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Buffer.from(bytes).toString('hex');
}

async function tokenKey(secret: string) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptRefreshToken(token: string, owner: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({
    name: 'AES-GCM',
    iv,
    additionalData: new TextEncoder().encode(`orbit-google-calendar:${owner}`),
  }, await tokenKey(secret), new TextEncoder().encode(token));
  return {
    ciphertext: Buffer.from(ciphertext).toString('base64url'),
    iv: Buffer.from(iv).toString('base64url'),
  };
}

async function decryptRefreshToken(row: CredentialRow, owner: string, secret: string) {
  try {
    const plaintext = await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv: Buffer.from(row.refresh_token_iv, 'base64url'),
      additionalData: new TextEncoder().encode(`orbit-google-calendar:${owner}`),
    }, await tokenKey(secret), Buffer.from(row.refresh_token_ciphertext, 'base64url'));
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new GoogleCalendarError('Google Takvim anahtarı okunamadı. Yeniden bağlanmalısın.', 401, true);
  }
}

export async function readGoogleCredential(owner: string) {
  return getDatabase().prepare(`SELECT refresh_token_ciphertext, refresh_token_iv, calendar_id
    FROM orbit_google_calendar_credentials WHERE owner = ?`).bind(owner).first<CredentialRow>();
}

export async function getGoogleAccessToken(owner: string) {
  const config = googleCalendarConfig();
  if (!config.configured) throw new GoogleCalendarError('Google Takvim sunucu ayarları eksik.', 503);
  const row = await readGoogleCredential(owner);
  if (!row) throw new GoogleCalendarError('Google Takvim bağlantısı bulunamadı.', 401, true);
  const refreshToken = await decryptRefreshToken(row, owner, config.encryptionSecret);
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const payload = await response.json().catch(() => ({})) as { access_token?: string; error?: string };
  if (!response.ok || !payload.access_token) {
    const reconnect = payload.error === 'invalid_grant';
    if (reconnect) await getDatabase().prepare('DELETE FROM orbit_google_calendar_credentials WHERE owner = ?').bind(owner).run();
    throw new GoogleCalendarError(reconnect ? 'Google izni sona ermiş. Yeniden bağlanmalısın.' : 'Google erişim anahtarı yenilenemedi.', reconnect ? 401 : 502, reconnect);
  }
  return { accessToken: payload.access_token, calendarId: row.calendar_id || config.calendarId };
}

export async function googleCalendarFetch(owner: string, path: (calendarId: string) => string, init: RequestInit = {}) {
  const { accessToken, calendarId } = await getGoogleAccessToken(owner);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(`${CALENDAR_API}${path(calendarId)}`, { ...init, headers });
  if (response.status === 401) throw new GoogleCalendarError('Google Takvim izni geçersiz. Yeniden bağlanmalısın.', 401, true);
  return response;
}

export function googleErrorResponse(error: unknown) {
  if (error instanceof GoogleCalendarError) {
    return Response.json({ error: error.message, reconnect: error.reconnect }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
  }
  console.error('Google Calendar service failed', error);
  return Response.json({ error: 'Google Takvim hizmetine şu anda ulaşılamıyor.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
