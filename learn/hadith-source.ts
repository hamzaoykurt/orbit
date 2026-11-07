// Hadith text is NEVER written by a model. The only collection offered is el-Erbaûn (Kırk Hadis) of İmam Nevevî,
// numbered 1-42, read from fawazahmed0/hadith-api (editions ara-nawawi and tur-nawawi) through jsDelivr.
// The Turkish text carries its own source tag (for example "[Buhari ve Müslim]"); the Arabic text names the narrators.
import { hasArabicScript } from './english';
import { fetchWithRetry } from './quran-source';
import type { KvLike } from './quran-source';

export const HADITH_API = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions';
export const NAWAWI_COUNT = 42;
export const HADITH_SOURCE = {
  collection: 'nawawi', name: 'el-Erbaûn (Kırk Hadis), İmam Nevevî', numbers: '1-42 (Nevevî sıralaması)',
  data: 'fawazahmed0/hadith-api, ara-nawawi ve tur-nawawi baskıları (jsDelivr)', url: 'https://github.com/fawazahmed0/hadith-api',
} as const;
export type HadithResult = { ref: string; collection: 'nawawi'; number: number; arabic: string; tr: string; attribution: string | null; source: typeof HADITH_SOURCE };

export function parseHadithRef(value: unknown): number | null {
  const match = typeof value === 'string' ? /^nawawi:([1-9]\d?)$/.exec(value) : null;
  const number = match ? Number(match[1]) : 0;
  return number >= 1 && number <= NAWAWI_COUNT ? number : null;
}

type Edition = { hadiths?: { hadithnumber?: number; text?: string }[] };
async function fetchEdition(edition: 'ara-nawawi' | 'tur-nawawi', number: number, transport: typeof fetch, signal?: AbortSignal) {
  const response = await fetchWithRetry(transport, `${HADITH_API}/${edition}/${number}.json`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000), headers: { Accept: 'application/json' } }).catch(() => { throw new Error('source-unavailable'); });
  if (!response.ok) throw new Error('source-unavailable');
  const raw = await response.text();
  if (raw.length > 100_000) throw new Error('source-invalid');
  let payload: Edition;
  try { payload = JSON.parse(raw); } catch { throw new Error('source-invalid'); }
  const entry = payload.hadiths?.length === 1 ? payload.hadiths[0] : undefined;
  const text = typeof entry?.text === 'string' ? entry.text.trim() : '';
  // The file must be exactly the requested hadith number, with real text.
  if (!entry || entry.hadithnumber !== number || text.length < 20 || text.length > 8000) throw new Error('source-invalid');
  return text;
}

export async function loadHadith(number: number, deps: { transport?: typeof fetch; cache?: KvLike | null; signal?: AbortSignal } = {}): Promise<HadithResult> {
  const transport = deps.transport ?? fetch, cache = deps.cache ?? null, key = `learn/v1/hadith/nawawi:${number}`;
  try {
    const stored = cache ? await cache.get(key) : null;
    const entry = stored ? JSON.parse(stored) as HadithResult : null;
    if (entry && entry.number === number && entry.ref === `nawawi:${number}` && hasArabicScript(entry.arabic) && entry.tr) return { ...entry, source: HADITH_SOURCE };
  } catch { /* cache is an optimisation only */ }
  const [arabic, tr] = await Promise.all([fetchEdition('ara-nawawi', number, transport, deps.signal), fetchEdition('tur-nawawi', number, transport, deps.signal)]);
  if (!hasArabicScript(arabic) || hasArabicScript(tr)) throw new Error('source-invalid');
  const tag = /\[([^\[\]]{2,60})\]\s*$/.exec(tr);
  const result: HadithResult = { ref: `nawawi:${number}`, collection: 'nawawi', number, arabic, tr, attribution: tag ? tag[1].trim() : null, source: HADITH_SOURCE };
  if (cache) await cache.put(key, JSON.stringify(result), { expirationTtl: 180 * 86_400 }).catch(() => undefined);
  return result;
}
