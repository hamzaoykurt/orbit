import { assertSafeUrl, fetchFollowingRedirects } from '../../../generation/safe-fetch';
import { BROWSER_HEADERS, requestText, type RequestOptions } from './web-fetch';
import { extractPage, isSufficient, MAX_PAGE_TEXT, type PageFacts } from './page-extract';

export const MAX_HTML_BYTES = 600_000;

export type LoadedContent = {
  /** full: readable page text; meta: only head metadata was available; none: nothing could be read. */
  quality: 'full' | 'meta' | 'none';
  source: 'direct' | 'reader' | 'none';
  title: string; description: string; text: string; thumbnailUrl?: string; images: string[];
};

export type LoadOptions = RequestOptions;

// Reads up to the cap and stops; the useful head of a page is always early, so a long page is truncated, not rejected.
const readCapped = async (response: Response, limit: number) => {
  if (!response.body) return '';
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  let result = ''; let size = 0;
  try {
    while (size < limit) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; result += decoder.decode(value, { stream: true }); }
    return result + decoder.decode();
  } finally { await reader.cancel().catch(() => undefined); }
};

const factsToContent = (facts: PageFacts, source: LoadedContent['source'], quality: LoadedContent['quality']): LoadedContent => ({
  quality, source,
  title: facts.ogTitle || facts.title || facts.headings[0] || '',
  description: facts.ogDescription || facts.description,
  text: [facts.headings.join(' · '), facts.text].filter(Boolean).join('\n').slice(0, MAX_PAGE_TEXT),
  thumbnailUrl: facts.ogImage || undefined, images: facts.ogImage ? [facts.ogImage] : [],
});

export async function fetchPageDirect(url: URL, options: LoadOptions = {}): Promise<PageFacts> {
  assertSafeUrl(url);
  const response = await fetchFollowingRedirects(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(options.timeoutMs ?? 10_000) }, { transport: options.transport });
  if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw new Error(`HTTP ${response.status}`); }
  const type = response.headers.get('content-type') ?? '';
  if (type && !/text\/html|application\/xhtml|text\/plain/i.test(type)) { await response.body?.cancel().catch(() => undefined); throw new Error('not-html'); }
  return extractPage(await readCapped(response, MAX_HTML_BYTES), response.url || url.toString());
}

const readerContent = async (url: URL, options: LoadOptions): Promise<LoadedContent | null> => {
  const text = await requestText(`https://r.jina.ai/${url.toString()}`, { Accept: 'text/plain', 'X-Return-Format': 'text' }, options);
  if (text.trim().length < 80) return null;
  const title = text.split('\n').map(line => line.replace(/^#+\s*/, '').trim()).find(Boolean) || '';
  const image = text.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/)?.[1];
  return { quality: 'full', source: 'reader', title, description: '', text: text.slice(0, MAX_PAGE_TEXT), thumbnailUrl: image, images: [] };
};

/** Order: direct fetch -> r.jina.ai reader -> whatever head metadata the direct fetch produced -> nothing. Never throws for access problems. */
export async function loadWebContent(url: URL, options: LoadOptions = {}): Promise<LoadedContent> {
  assertSafeUrl(url); // an internal/private target is a user error, not something to fall back from
  let facts: PageFacts | null = null;
  try { facts = await fetchPageDirect(url, options); } catch { /* blocked, timed out or not HTML: try the reader */ }
  if (facts && isSufficient(facts)) return factsToContent(facts, 'direct', facts.text.length >= 300 ? 'full' : 'meta');
  try {
    const reader = await readerContent(url, options);
    if (reader) {
      const image = reader.thumbnailUrl ?? (facts?.ogImage || undefined);
      return { ...reader, title: reader.title || facts?.ogTitle || facts?.title || '', description: facts?.ogDescription || facts?.description || '', thumbnailUrl: image, images: facts?.ogImage ? [facts.ogImage] : [] };
    }
  } catch { /* reader unavailable or rate limited: fall through to metadata */ }
  if (facts && (facts.title || facts.ogTitle || facts.description || facts.ogDescription || facts.text)) return factsToContent(facts, 'direct', 'meta');
  return { quality: 'none', source: 'none', title: '', description: '', text: '', images: [] };
}
