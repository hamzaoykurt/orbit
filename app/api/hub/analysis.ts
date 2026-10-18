import { HUB_CATEGORIES, matchHubCategory } from '../../hub/hub-model';
import type { HubAnalysis, HubPlatform } from '../../hub/hub-model';
import type { LoadedContent } from './content-source';

export const ESTIMATE_NOTICE = 'Tahmini analiz: sayfa okunamadı. Bilgiler alan adından tahmin edildi, doğru olmayabilir.';
export const MAX_AI_TEXT = 9_000;

export type ModelResult = { title?: unknown; summary?: unknown; purpose?: unknown; category?: unknown; mainCategory?: unknown; categories?: unknown };
export type Analysis = HubAnalysis & { notice?: string };

const str = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
export const hostName = (url: URL) => url.hostname.replace(/^www\./i, '') || url.toString();

export const SYSTEM_PROMPT = "Sen Orbit Hub'ın bağlantı analizcisisin. ZORUNLU KURAL: title, summary ve purpose alanları HER ZAMAN Türkçe olmalı. Kaynak metin İngilizce veya başka bir dilde olsa bile kendi cümlelerinle Türkçe yaz; kaynak cümleleri aynen kopyalama. Marka, ürün, site ve özel adları çevirme. Yalnızca geçerli JSON döndür.";
export const buildMessages = (prompt: string): ChatMessage[] => [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }];
export type ChatMessage = { role: 'system' | 'user'; content: string };

const TR_WORDS = new Set(['ve', 'bir', 'bu', 'için', 'ile', 'da', 'de', 'olarak', 'daha', 'gibi', 'çok', 'en', 'veya', 'ya', 'ki', 'mi', 'ne', 'her', 'sayfa', 'site', 'araç', 'uygulama', 'yapay', 'kullanılır', 'sağlar', 'olan', 'üzerinde', 'kadar', 'sonra', 'ama', 'hem']);
const EN_WORDS = new Set(['the', 'and', 'for', 'with', 'to', 'of', 'your', 'you', 'is', 'are', 'a', 'an', 'in', 'on', 'that', 'from', 'this', 'it', 'by', 'as', 'be', 'can', 'will', 'our', 'we', 'or', 'create', 'make']);
/** Cheap language check: Turkish letters or Turkish function words must outweigh English function words. Unknown/short text passes. */
export function looksTurkish(text: string) {
  const words = text.toLocaleLowerCase('tr').match(/[a-zçğıöşü]+/g) ?? [];
  if (!words.length) return true;
  let tr = 0; let en = 0;
  for (const word of words) { if (TR_WORDS.has(word)) tr++; if (EN_WORDS.has(word)) en++; }
  const turkishLetters = (text.match(/[çğıöşüÇĞİÖŞÜ]/g) ?? []).length;
  if (turkishLetters >= 2 && turkishLetters / words.length >= 0.15) tr += 2;
  return tr >= en;
}
export const isTurkishResult = (result: ModelResult) => looksTurkish([result.title, result.summary, result.purpose].filter((value): value is string => typeof value === 'string').join(' '));

export const correctionPrompt = (result: ModelResult) => `Aşağıdaki JSON'daki title, summary ve purpose alanları Türkçe değil. Anlamı koruyarak bunları doğal Türkçeyle yeniden yaz (marka ve özel adları çevirme). category ve categories alanlarını aynen bırak. Aynı JSON şemasıyla yalnızca JSON döndür.
${JSON.stringify({ title: result.title, summary: result.summary, purpose: result.purpose, category: result.category ?? result.mainCategory, categories: result.categories })}`;

export type ModelRunner = (messages: ChatMessage[]) => Promise<ModelResult | null>;
/** Tries the runners in order (Groq, then Workers AI). A non-Turkish answer gets one correction request on the same runner. */
export async function generateAnalysis(prompt: string, runners: ModelRunner[]): Promise<{ result: ModelResult; untranslated: boolean } | null> {
  let fallback: ModelResult | null = null;
  for (const run of runners) {
    let result: ModelResult | null = null;
    try { result = await run(buildMessages(prompt)); } catch { result = null; }
    if (!result) continue;
    if (isTurkishResult(result)) return { result, untranslated: false };
    let corrected: ModelResult | null = null;
    try { corrected = await run([...buildMessages(prompt), { role: 'user', content: correctionPrompt(result) }]); } catch { corrected = null; }
    if (corrected && isTurkishResult(corrected)) return { result: corrected, untranslated: false };
    fallback ??= result;
  }
  return fallback ? { result: fallback, untranslated: true } : null;
}

export function buildPrompt(url: URL, platform: HubPlatform, content: { title: string; description: string; text: string }, estimated: boolean) {
  const schema = '{"title":"Türkçe başlık, en fazla 80 karakter","summary":"1-2 cümlelik Türkçe özet","purpose":"Ne işe yarar: tek cümle, Türkçe","category":"' + HUB_CATEGORIES.join('|') + '","categories":["en fazla 4 kısa Türkçe etiket"]}';
  const facts = `Platform: ${platform}\nAlan adı: ${hostName(url)}\nURL: ${url.toString()}\nSayfa başlığı: ${content.title || '-'}\nMeta açıklama: ${content.description || '-'}`;
  if (estimated) return `Bu sayfa okunamadı. Elindeki tek bilgiler alan adı ve varsa meta veriler. Buna dayanarak TAHMİNİ bir analiz yap; emin olmadığın hiçbir ayrıntıyı kesin bilgi gibi yazma, "olabilir/muhtemelen" gibi ifadeler kullan, bilgi yoksa genel ve temkinli kal. Yalnızca şu JSON'u döndür: ${schema}\n${facts}`;
  return `Bu web sayfasını Türkçe analiz et. Sayfanın ne işe yaradığını açıkça söyle. Yalnızca şu JSON'u döndür: ${schema}\n${facts}\nİçerik:\n${content.text.slice(0, MAX_AI_TEXT)}`;
}

export function fromModel(url: URL, platform: HubPlatform, result: ModelResult, content: LoadedContent, extra: { thumbnailUrl?: string; author?: string; images?: string[] }, estimated: boolean, untranslated = false): Analysis {
  const analysis: Analysis = {
    url: url.toString(), platform,
    title: str(result.title, 120) || content.title || hostName(url),
    summary: str(result.summary, 1600),
    mainCategory: matchHubCategory(result.category ?? result.mainCategory),
    categories: Array.isArray(result.categories) ? result.categories.filter((item): item is string => typeof item === 'string').map(item => item.slice(0, 50)).slice(0, 4) : [],
    thumbnailUrl: extra.thumbnailUrl, author: extra.author, embedded: [], images: extra.images ?? [],
  };
  const purpose = str(result.purpose, 400);
  if (purpose) analysis.purpose = purpose;
  if (estimated) { analysis.estimated = true; analysis.notice = ESTIMATE_NOTICE; }
  if (untranslated) analysis.untranslated = true;
  return analysis;
}

// No model available (no key, quota, error): build something useful from the page itself without inventing anything.
export function fromContent(url: URL, platform: HubPlatform, content: LoadedContent, extra: { thumbnailUrl?: string; author?: string; images?: string[] }): Analysis {
  const sentence = content.text.replace(/\s+/g, ' ').trim().slice(0, 420);
  const summary = content.description || sentence;
  const analysis: Analysis = {
    url: url.toString(), platform, title: content.title || hostName(url),
    summary: summary || 'İçerik otomatik okunamadı.',
    mainCategory: 'Diğer', categories: [], thumbnailUrl: extra.thumbnailUrl, author: extra.author, embedded: [], images: extra.images ?? [],
  };
  // The page's own text is shown as-is; flag it when it is not Turkish so it is never mistaken for a Turkish description.
  if (!looksTurkish(`${analysis.title} ${analysis.summary}`)) analysis.untranslated = true;
  if (content.quality === 'none') analysis.notice = 'Sayfa içeriği şu an okunamadı; bağlantı yine de kaydedildi.';
  return analysis;
}
