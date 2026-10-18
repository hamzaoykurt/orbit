import type { HubAnalysis, HubPlatform } from '../../hub/hub-model';
import type { LoadedContent } from './content-source';

export const HUB_CATEGORIES = ['Yapay Zeka', 'Yazılım Geliştirme', 'GitHub', 'Haberler', 'Araçlar', 'Tasarım', 'İş Dünyası', 'Diğer'] as const;
export const ESTIMATE_NOTICE = 'Tahmini analiz: sayfa okunamadı. Bilgiler alan adından tahmin edildi, doğru olmayabilir.';
export const MAX_AI_TEXT = 9_000;

export type ModelResult = { title?: unknown; summary?: unknown; purpose?: unknown; category?: unknown; mainCategory?: unknown; categories?: unknown };
export type Analysis = HubAnalysis & { notice?: string };

const str = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
export const hostName = (url: URL) => url.hostname.replace(/^www\./i, '') || url.toString();

export function buildPrompt(url: URL, platform: HubPlatform, content: { title: string; description: string; text: string }, estimated: boolean) {
  const schema = '{"title":"Türkçe başlık, en fazla 80 karakter","summary":"1-2 cümlelik Türkçe özet","purpose":"Ne işe yarar: tek cümle, Türkçe","category":"' + HUB_CATEGORIES.join('|') + '","categories":["en fazla 4 kısa etiket"]}';
  const facts = `Platform: ${platform}\nAlan adı: ${hostName(url)}\nURL: ${url.toString()}\nSayfa başlığı: ${content.title || '-'}\nMeta açıklama: ${content.description || '-'}`;
  if (estimated) return `Bu sayfa okunamadı. Elindeki tek bilgiler alan adı ve varsa meta veriler. Buna dayanarak TAHMİNİ bir analiz yap; emin olmadığın hiçbir ayrıntıyı kesin bilgi gibi yazma, "olabilir/muhtemelen" gibi ifadeler kullan, bilgi yoksa genel ve temkinli kal. Yalnızca şu JSON'u döndür: ${schema}\n${facts}`;
  return `Bu web sayfasını Türkçe analiz et. Sayfanın ne işe yaradığını açıkça söyle. Yalnızca şu JSON'u döndür: ${schema}\n${facts}\nİçerik:\n${content.text.slice(0, MAX_AI_TEXT)}`;
}

const pickCategory = (raw: unknown) => {
  const value = str(raw, 80);
  return HUB_CATEGORIES.find(item => item.toLocaleLowerCase('tr') === value.toLocaleLowerCase('tr')) ?? (value || 'Diğer');
};

export function fromModel(url: URL, platform: HubPlatform, result: ModelResult, content: LoadedContent, extra: { thumbnailUrl?: string; author?: string; images?: string[] }, estimated: boolean): Analysis {
  const analysis: Analysis = {
    url: url.toString(), platform,
    title: str(result.title, 120) || content.title || hostName(url),
    summary: str(result.summary, 1600),
    mainCategory: pickCategory(result.category ?? result.mainCategory),
    categories: Array.isArray(result.categories) ? result.categories.filter((item): item is string => typeof item === 'string').map(item => item.slice(0, 50)).slice(0, 4) : [],
    thumbnailUrl: extra.thumbnailUrl, author: extra.author, embedded: [], images: extra.images ?? [],
  };
  const purpose = str(result.purpose, 400);
  if (purpose) analysis.purpose = purpose;
  if (estimated) { analysis.estimated = true; analysis.notice = ESTIMATE_NOTICE; }
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
  if (content.quality === 'none') analysis.notice = 'Sayfa içeriği şu an okunamadı; bağlantı yine de kaydedildi.';
  return analysis;
}
