// Qur'an text is NEVER written by a model. Arabic (Uthmani script), Turkish meal (Diyanet İşleri) and Turkish
// transliteration come from the public AlQuran Cloud API, are validated here, and are cached per ayah.
// Source: https://alquran.cloud/api (editions quran-uthmani, tr.diyanet, tr.transliteration).
export const QURAN_API = 'https://api.alquran.cloud/v1';
export const QURAN_EDITIONS = ['quran-uthmani', 'tr.diyanet', 'tr.transliteration'] as const;
export const MAX_RANGE = 12;
// Ayah count of each of the 114 surahs (total 6236). Taken from https://api.alquran.cloud/v1/meta (read 2026-11-07).
export const AYAH_COUNTS = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6] as const;

// The Diyanet meal in this edition gives ONE shared text for some neighbouring ayahs (568 groups, for example 113:1-5 and
// 110:1-3). The groups below were computed from the full tr.diyanet edition (read 2026-11-07) so that even a single-ayah
// request can tell the client that its meal covers a wider span.
const SHARED_MEAL = '2:45-46,2:65-66,2:183-184,2:204-205,3:3-4,3:16-17,3:33-34,3:48-49,3:50-51,3:55-56,3:72-73,3:105-106,3:113-114,3:124-125,3:126-127,3:166-167,3:169-170,3:196-197,4:55-56,4:67-68,4:95-96,4:117-119,4:142-143,4:150-151,4:153-154,4:156-158,4:160-161,4:164-165,4:168-169,5:83-84,5:116-117,6:61-62,6:71-72,6:84-86,6:112-113,6:155-157,7:16-17,7:44-45,7:48-49,7:50-51,7:61-63,7:68-69,7:76-77,7:80-81,7:88-89,7:107-108,7:109-110,7:111-112,7:120-122,7:123-124,7:125-126,7:138-139,7:156-157,7:169-170,7:172-173,8:2-3,8:7-8,8:20-21,8:36-37,8:50-51,8:56-57,8:62-63,8:65-66,9:1-2,9:14-15,9:21-22,10:7-8,10:28-29,10:81-82,10:85-86,10:96-97,10:105-106,11:1-3,11:25-26,11:33-34,11:36-37,11:38-39,11:54-57,11:82-83,11:96-97,11:118-119,11:121-122,12:11-12,12:16-17,12:26-27,12:28-29,12:82-84,12:92-93,12:102-103,13:9-10,13:22-24,14:1-2,14:13-14,14:24-25,14:28-29,14:32-33,14:44-45,14:47-48,15:6-7,15:12-13,15:14-15,15:28-29,15:30-31,15:34-35,15:37-38,15:39-40,15:41-42,15:49-50,15:52-53,15:56-57,15:58-60,15:61-62,15:63-65,15:68-69,15:90-93,15:95-96,15:98-99,16:15-16,16:38-39,16:43-44,16:46-47,16:54-55,16:68-69,17:2-3,17:9-10,17:50-51,17:107-108,18:1-4,18:11-12,18:13-15,18:23-24,18:30-31,18:35-36,18:37-41,18:69-70,18:87-88,18:95-96,18:100-101,19:5-6,19:12-14,19:24-25,19:27-28,19:30-33,19:60-61,19:85-86,19:90-91,19:92-93,20:2-4,20:21-23,20:25-35,20:36-39,20:46-48,20:56-58,20:63-64,20:72-73,20:75-76,20:92-93,20:99-100,20:105-108,20:116-119,21:2-3,21:60-61,21:64-65,21:66-67,22:6-7,22:8-9,22:19-21,22:34-35,22:42-44,22:67-69,23:5-6,23:10-11,23:19-20,23:24-25,23:45-46,23:47-48,23:55-56,23:57-61,23:66-67,23:73-74,23:82-83,23:93-94,23:99-100,23:108-111,23:114-115,24:6-7,24:8-9,24:23-24,25:1-2,25:7-8,25:27-29,25:45-46,25:48-49,25:65-66,26:10-11,26:12-14,26:15-17,26:18-19,26:20-22,26:34-35,26:36-37,26:46-48,26:50-51,26:53-56,26:57-59,26:72-73,26:75-83,26:84-89,26:90-91,26:92-93,26:94-95,26:96-102,26:106-110,26:112-115,26:117-118,26:124-135,26:137-138,26:142-152,26:153-154,26:155-156,26:161-166,26:168-169,26:170-171,26:177-184,26:185-187,26:193-195,26:198-199,26:200-202,26:205-207,26:208-209,26:217-220,26:225-226,27:2-3,27:10-12,27:20-21,27:22-26,27:29-31,27:34-35,27:36-37,27:67-68,27:91-92,28:5-6,28:33-34,28:76-77,29:2-3,29:20-21,29:33-34,29:54-55,29:58-59,29:65-66,30:2-5,30:17-18,30:31-32,30:33-34,30:48-49,31:2-3,31:8-9,32:7-9,32:15-16,33:18-19,33:45-46,33:64-65,33:67-68,33:70-71,34:4-5,34:7-8,34:10-11,34:51-52,35:19-21,35:42-43,36:2-4,36:5-6,36:16-17,36:26-27,36:28-29,36:41-42,36:59-61,36:77-78,37:1-5,37:8-9,37:15-17,37:22-23,37:41-44,37:45-47,37:48-49,37:51-53,37:58-59,37:78-79,37:88-89,37:91-92,37:95-96,37:103-105,37:108-109,37:119-120,37:124-126,37:127-128,37:129-130,37:134-135,37:137-138,37:143-144,37:151-152,37:161-163,37:164-166,37:167-169,38:1-2,38:4-5,38:6-8,38:12-13,38:18-19,38:21-22,38:32-33,38:36-38,38:67-68,38:71-72,38:73-74,38:77-78,38:80-81,38:82-83,38:84-85,39:17-18,39:39-40,39:57-58,40:23-24,40:30-31,40:36-37,40:53-54,40:71-72,40:73-74,40:75-76,41:2-5,41:30-32,41:41-42,42:25-26,42:36-38,42:52-53,43:2-3,43:12-14,43:26-27,43:33-35,43:38-39,43:41-42,43:88-89,44:2-3,44:4-7,44:10-11,44:13-14,44:25-27,44:30-31,44:34-36,44:43-46,44:47-50,44:51-52,44:56-57,44:58-59,45:7-8,45:9-10,46:17-18,46:24-25,47:20-21,48:8-9,48:18-19,49:7-8,50:2-3,50:7-8,50:9-11,50:12-14,50:17-18,50:24-26,50:28-29,50:32-34,51:1-6,51:7-8,51:10-11,51:15-16,51:20-21,51:26-27,51:32-34,51:41-42,52:1-8,52:9-12,52:13-14,52:15-16,52:17-18,52:19-20,52:26-28,53:5-7,53:13-14,53:19-20,53:31-32,53:33-34,53:36-37,53:45-46,53:50-51,53:53-54,54:1-2,54:7-8,54:13-14,54:19-20,54:24-25,54:34-35,54:54-55,55:1-2,55:3-4,55:11-12,56:1-3,56:4-7,56:11-12,56:13-14,56:15-16,56:17-21,56:22-24,56:27-34,56:35-38,56:39-40,56:42-44,56:45-46,56:49-50,56:58-59,56:60-61,56:63-64,56:65-67,56:68-69,56:71-72,56:75-76,56:77-80,56:83-85,56:86-87,56:88-89,65:2-3,68:1-2,68:5-6,68:10-14,68:17-18,68:19-20,68:21-22,68:23-24,68:26-27,68:42-43,68:50-51,69:11-12,69:13-15,69:19-20,69:21-23,69:25-29,69:36-37,69:38-40,69:44-46,70:1-3,70:11-14,70:15-18,70:22-27,70:29-30,70:36-37,70:40-41,70:43-44,71:3-4,71:10-11,71:19-20,71:21-22,72:1-2,72:16-17,72:27-28,73:1-4,73:12-13,74:8-10,74:11-14,74:24-25,74:32-37,74:39-42,74:50-51,75:5-6,75:7-10,75:14-15,75:22-23,75:26-27,75:31-33,76:9-10,77:1-7,77:16-17,77:20-22,77:25-26,77:30-31,77:32-33,78:2-3,78:6-7,78:14-16,78:21-22,78:24-26,78:31-34,79:4-5,79:27-28,79:34-35,79:37-39,79:40-41,80:1-2,80:5-6,80:8-10,80:13-14,80:15-16,80:26-31,80:34-36,80:38-39,80:40-41,81:3-4,81:8-9,81:15-16,81:19-21,81:27-28,82:6-8,82:10-12,83:1-3,83:4-5,83:20-21,83:22-23,83:25-26,83:27-28,83:35-36,84:1-2,84:3-5,84:7-9,84:10-12,85:4-7,85:8-9,85:14-15,85:17-18,85:21-22,86:6-7,86:8-9,86:11-12,87:14-15,87:18-19,88:6-7,88:17-20,88:23-24,89:4-5,89:6-8,89:9-12,90:1-2,90:8-9,90:14-16,91:11-12,92:5-7,92:8-10,92:15-16,92:17-18,92:19-20,94:2-3,96:3-5,96:6-7,96:9-10,96:11-13,98:1-3,99:1-3,99:4-5,100:9-10,101:6-7,102:1-2,104:1-2,104:6-7,104:8-9,105:3-4,106:1-2,106:3-4,107:2-3,110:1-3,111:4-5,113:1-5,114:1-6';
const sharedMeal = new Map<number, [number, number][]>();
for (const part of SHARED_MEAL.split(',')) {
  const [surah, span] = part.split(':'); const [from, to] = span.split('-').map(Number);
  sharedMeal.set(Number(surah), [...(sharedMeal.get(Number(surah)) ?? []), [from, to]]);
}
/** The ayah span a Diyanet meal text really covers, or null when the ayah has a meal of its own. */
export const mealSpan = (surah: number, ayah: number): { from: number; to: number } | null => {
  const hit = sharedMeal.get(surah)?.find(([from, to]) => ayah >= from && ayah <= to);
  return hit ? { from: hit[0], to: hit[1] } : null;
};

export type VerseRef = { surah: number; from: number; to: number };
export type Ayah = { surah: number; ayah: number; arabic: string; tr: string; translit: string };
export type SurahInfo = { number: number; nameAr: string; englishName: string; numberOfAyahs: number };
export type VerseResult = {
  ref: string; surah: SurahInfo; source: typeof VERSE_SOURCE;
  ayahs: (Ayah & { words: string[]; mealSpan: { from: number; to: number } | null })[];
  /** Meal texts de-duplicated: ayahs that share one Diyanet text appear once (ayahs = the requested numbers it covers). */
  mealGroups: { ayahs: number[]; span: { from: number; to: number } | null; tr: string }[];
};
export const VERSE_SOURCE = {
  name: 'AlQuran Cloud', url: 'https://alquran.cloud/api',
  arabic: 'Kur\'an-ı Kerîm, Osmanlı (Uthmani) imlâsı (quran-uthmani)', meal: 'Diyanet İşleri Başkanlığı meâli (tr.diyanet)', translit: 'Çeviriyazı: Muhammet Abay (tr.transliteration)',
} as const;
export type KvLike = { get(key: string): Promise<string | null>; put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> };

export const refText = (ref: VerseRef) => ref.from === ref.to ? `${ref.surah}:${ref.from}` : `${ref.surah}:${ref.from}-${ref.to}`;

export function parseVerseRef(value: unknown): VerseRef | null {
  const match = typeof value === 'string' ? /^(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/.exec(value) : null;
  if (!match) return null;
  const surah = Number(match[1]), from = Number(match[2]), to = match[3] === undefined ? from : Number(match[3]);
  if (surah < 1 || surah > 114 || from < 1 || to < from || to > AYAH_COUNTS[surah - 1] || to - from + 1 > MAX_RANGE) return null;
  return { surah, from, to };
}

const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭ࣓-ࣿ]/g;
const bare = (value: string) => value.replace(MARKS, '').replace(/[ٱآأإ]/g, 'ا').replace(/ـ/g, '');
// AlQuran Cloud prepends the basmala to the first ayah of every surah except 1 and 9. It is not part of that ayah.
const BASMALA_WORDS = 'بسم الله الرحمن الرحيم';
export function withoutBasmala(arabic: string, surah: number, ayah: number) {
  const text = arabic.replace(/^﻿/, '').trim();
  if (ayah !== 1 || surah === 1 || surah === 9) return text;
  const words = text.split(/\s+/);
  if (words.length > 4 && bare(words.slice(0, 4).join(' ')) === BASMALA_WORDS) return words.slice(4).join(' ');
  return text;
}

/** One retry after a short pause on a network error, 429 or 5xx: the public APIs rate-limit bursts. */
export async function fetchWithRetry(transport: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await transport(url, init);
      if (response.ok || attempt === 1 || (response.status !== 429 && response.status < 500)) return response;
      await response.body?.cancel();
    } catch (error) { if (attempt === 1 || init.signal?.aborted) throw error; }
    await new Promise(resolve => setTimeout(resolve, 400));
  }
}

const cacheKey = (surah: number, ayah: number) => `learn/v1/ayah/${surah}:${ayah}`;
const ARABIC = /[؀-ۿ]/;
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/^﻿/, '').trim().slice(0, max + 1) : '';

type ApiEdition = { edition?: { identifier?: string }; englishName?: string; name?: string; number?: number; numberOfAyahs?: number; ayahs?: { numberInSurah?: number; text?: string }[] };

async function fetchSpan(surah: number, from: number, to: number, transport: typeof fetch, signal?: AbortSignal) {
  const url = `${QURAN_API}/surah/${surah}/editions/${QURAN_EDITIONS.join(',')}?offset=${from - 1}&limit=${to - from + 1}`;
  const response = await fetchWithRetry(transport, url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000), headers: { Accept: 'application/json' } }).catch(() => { throw new Error('source-unavailable'); });
  if (!response.ok) throw new Error('source-unavailable');
  const raw = await response.text();
  if (raw.length > 400_000) throw new Error('source-invalid');
  let payload: { code?: number; data?: ApiEdition[] };
  try { payload = JSON.parse(raw); } catch { throw new Error('source-invalid'); }
  const data = payload.code === 200 && Array.isArray(payload.data) ? payload.data : [];
  if (data.length !== QURAN_EDITIONS.length) throw new Error('source-invalid');
  const count = to - from + 1;
  const columns = QURAN_EDITIONS.map((identifier, index) => {
    const edition = data[index];
    const ayahs = edition.ayahs ?? [];
    // Every edition must answer for exactly the requested surah:ayah range, in order. Anything else is not trusted.
    if (edition.edition?.identifier !== identifier || edition.number !== surah || ayahs.length !== count || ayahs.some((item, offset) => item.numberInSurah !== from + offset)) throw new Error('source-invalid');
    return ayahs;
  });
  const info: SurahInfo = { number: surah, nameAr: clean(data[0].name, 60), englishName: clean(data[0].englishName, 60), numberOfAyahs: AYAH_COUNTS[surah - 1] };
  if (data[0].numberOfAyahs !== info.numberOfAyahs || !info.nameAr || !info.englishName) throw new Error('source-invalid');
  const ayahs: Ayah[] = Array.from({ length: count }, (_, offset) => {
    const number = from + offset;
    const arabic = withoutBasmala(clean(columns[0][offset].text, 3000), surah, number), tr = clean(columns[1][offset].text, 3000), translit = clean(columns[2][offset].text, 3000);
    if (!arabic || !ARABIC.test(arabic) || arabic.length > 3000 || !tr || tr.length > 3000 || !translit || translit.length > 3000) throw new Error('source-invalid');
    return { surah, ayah: number, arabic, tr, translit };
  });
  return { info, ayahs };
}

/** Verses for a reference. Cached ayahs are read from KV first; the rest come from one API call. */
export async function loadVerses(ref: VerseRef, deps: { transport?: typeof fetch; cache?: KvLike | null; signal?: AbortSignal } = {}): Promise<VerseResult> {
  const transport = deps.transport ?? fetch, cache = deps.cache ?? null;
  const found = new Map<number, { surah: SurahInfo; ayah: Ayah }>();
  for (let number = ref.from; number <= ref.to; number++) {
    try {
      const stored = cache ? await cache.get(cacheKey(ref.surah, number)) : null;
      const entry = stored ? JSON.parse(stored) as { surah: SurahInfo; ayah: Ayah } : null;
      // A damaged or foreign cache entry is ignored, never served.
      if (entry && entry.ayah?.surah === ref.surah && entry.ayah.ayah === number && ARABIC.test(entry.ayah.arabic) && entry.ayah.tr && entry.surah?.number === ref.surah) found.set(number, entry);
    } catch { /* cache is an optimisation only */ }
  }
  const missing = [...Array(ref.to - ref.from + 1).keys()].map(offset => ref.from + offset).filter(number => !found.has(number));
  if (missing.length) {
    const fetched = await fetchSpan(ref.surah, missing[0], missing.at(-1)!, transport, deps.signal);
    for (const ayah of fetched.ayahs) {
      const entry = { surah: fetched.info, ayah };
      found.set(ayah.ayah, entry);
      // Only ayahs of the requested range are kept; the span may include already cached ones in between.
      if (cache) await cache.put(cacheKey(ref.surah, ayah.ayah), JSON.stringify(entry), { expirationTtl: 180 * 86_400 }).catch(() => undefined);
    }
  }
  const ordered = [...Array(ref.to - ref.from + 1).keys()].map(offset => found.get(ref.from + offset)!);
  const ayahs = ordered.map(entry => ({ ...entry.ayah, words: entry.ayah.arabic.split(/\s+/).filter(Boolean), mealSpan: mealSpan(ref.surah, entry.ayah.ayah) }));
  const mealGroups: VerseResult['mealGroups'] = [];
  for (const item of ayahs) {
    const last = mealGroups.at(-1);
    if (last && last.tr === item.tr) last.ayahs.push(item.ayah); else mealGroups.push({ ayahs: [item.ayah], span: item.mealSpan, tr: item.tr });
  }
  return { ref: refText(ref), surah: ordered[0].surah, ayahs, mealGroups, source: VERSE_SOURCE };
}
