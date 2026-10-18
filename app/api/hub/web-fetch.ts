import { fetchFollowingRedirects, RedirectError } from '../../../generation/safe-fetch';
import type { HubAnalysis, HubPlatform } from '../../hub/hub-model';

export const MAX_REMOTE_BYTES = 320_000;
export const UNREADABLE_NOTICE = 'Sayfa içeriği şu an okunamadı; bağlantı yine de kaydedildi.';
export const UNREADABLE_SUMMARY = 'İçerik otomatik okunamadı.';

// Ordinary browser headers only; no other tricks. Callers may override any of them.
export const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
};

export class SourceError extends Error {
  status: number;
  constructor(status: number) { super(`İçerik kaynağı ${status} döndürdü.`); this.name = 'SourceError'; this.status = status; }
}

export const readLimited = async (response: Response, limit = MAX_REMOTE_BYTES) => {
  const advertised = Number(response.headers.get('content-length') ?? 0);
  if (advertised > limit) throw new Error('İçerik analiz sınırını aşıyor.');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = '';
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('İçerik analiz sınırını aşıyor.');
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally { await reader.cancel().catch(() => undefined); }
};

// Retry-After in whole seconds, honoured only when short (<= 3 s).
export const shortRetryDelay = (response: Response) => {
  const raw = response.headers.get('retry-after');
  if (!raw || !/^\d+$/.test(raw.trim())) return null;
  const seconds = Number(raw);
  return seconds <= 3 ? seconds * 1000 : null;
};

export type RequestOptions = { transport?: typeof fetch; sleep?: (ms: number) => Promise<void>; timeoutMs?: number };

export const requestText = async (url: string, headers: HeadersInit = {}, options: RequestOptions = {}) => {
  const merged = { ...BROWSER_HEADERS, ...Object.fromEntries(new Headers(headers).entries()) };
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const attempt = () => fetchFollowingRedirects(url, { headers: merged, signal: AbortSignal.timeout(options.timeoutMs ?? 12_000) }, { transport: options.transport });
  let response: Response;
  try { response = await attempt(); }
  catch (error) { if (error instanceof RedirectError) throw new Error(`Bağlantı açılamadı: ${error.message}`); throw error; }
  if (response.status === 429) {
    const delay = shortRetryDelay(response);
    if (delay !== null) {
      await response.body?.cancel().catch(() => undefined);
      await sleep(delay);
      try { response = await attempt(); }
      catch (error) { if (error instanceof RedirectError) throw new Error(`Bağlantı açılamadı: ${error.message}`); throw error; }
    }
  }
  if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw new SourceError(response.status); }
  return readLimited(response);
};

// Access problems (bot protection, rate limit, server trouble, network, timeout) must not stop a link from being saved.
export const isUnreadable = (error: unknown) => {
  if (error instanceof SourceError) return error.status === 403 || error.status === 408 || error.status === 429 || error.status >= 500;
  if (error instanceof RedirectError) return false;
  if (error instanceof Error) return error.name === 'TimeoutError' || error.name === 'AbortError' || error instanceof TypeError;
  return false;
};

export const hostTitle = (url: URL) => url.hostname.replace(/^www\./i, '') || url.toString();

export const unreadableAnalysis = (url: URL, platform: HubPlatform): HubAnalysis & { notice: string } => ({
  url: url.toString(), platform, title: hostTitle(url), summary: UNREADABLE_SUMMARY,
  categories: [], mainCategory: 'Diğer', embedded: [], images: [], notice: UNREADABLE_NOTICE,
});
