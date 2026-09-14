import { authenticatedUser, unauthorized } from '../../../../auth/context';
import type { HubAnalysis, HubPlatform } from '../../../hub/hub-model';

export const dynamic = 'force-dynamic';

const MAX_REQUEST_BYTES = 4096;
const MAX_REMOTE_BYTES = 320_000;
const MAX_AI_TEXT = 9_000;

const json = (data: unknown, init: ResponseInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
};

const readLimited = async (response: Response, limit = MAX_REMOTE_BYTES) => {
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

const requestText = async (url: string, headers: HeadersInit = {}) => {
  const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`İçerik kaynağı ${response.status} döndürdü.`);
  return readLimited(response);
};

const normalizeUrl = (value: unknown) => {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.hash = '';
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref']) url.searchParams.delete(key);
    return url;
  } catch { return null; }
};

const platformFor = (host: string): HubPlatform => {
  if (host === 'youtube.com' || host === 'youtu.be') return 'youtube';
  if (host === 'x.com' || host === 'twitter.com') return 'twitter';
  if (host === 'github.com') return 'github';
  if (host === 'instagram.com') return 'instagram';
  return 'web';
};

type FetchedContent = { title: string; content: string; author?: string; thumbnailUrl?: string; images: string[] };

const youtubeId = (url: URL) => url.hostname === 'youtu.be' ? url.pathname.split('/').filter(Boolean)[0] : url.searchParams.get('v');

const fetchYoutube = async (url: URL): Promise<FetchedContent> => {
  const id = youtubeId(url);
  if (!id || !/^[\w-]{6,20}$/.test(id)) throw new Error('Geçerli bir YouTube video adresi gerekli.');
  const oembed = JSON.parse(await requestText(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://youtube.com/watch?v=${id}`)}&format=json`)) as { title?: string; author_name?: string; thumbnail_url?: string };
  let readable = '';
  try { readable = await requestText(`https://r.jina.ai/https://www.youtube.com/watch?v=${encodeURIComponent(id)}`, { Accept: 'text/plain' }); } catch { /* title still provides a usable fallback */ }
  return { title: oembed.title || 'YouTube videosu', author: oembed.author_name, thumbnailUrl: oembed.thumbnail_url || `https://img.youtube.com/vi/${id}/hqdefault.jpg`, images: [], content: `Video: ${oembed.title ?? ''}\nKanal: ${oembed.author_name ?? ''}\n${readable}`.slice(0, MAX_AI_TEXT) };
};

const fetchGithub = async (url: URL): Promise<FetchedContent> => {
  const [owner, repo, area, number] = url.pathname.split('/').filter(Boolean);
  if (!owner || !repo || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) throw new Error('Geçerli bir GitHub adresi gerekli.');
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const endpoint = area === 'issues' && /^\d+$/.test(number ?? '') ? `${base}/issues/${number}` : area === 'pull' && /^\d+$/.test(number ?? '') ? `${base}/pulls/${number}` : base;
  const data = JSON.parse(await requestText(endpoint, { Accept: 'application/vnd.github+json', 'User-Agent': 'Orbit-Hub' })) as Record<string, unknown>;
  const title = typeof data.title === 'string' ? data.title : typeof data.full_name === 'string' ? data.full_name : `${owner}/${repo}`;
  const description = typeof data.body === 'string' ? data.body : typeof data.description === 'string' ? data.description : '';
  const author = data.user && typeof data.user === 'object' && typeof (data.user as { login?: unknown }).login === 'string' ? (data.user as { login: string }).login : owner;
  return { title, author, images: [], content: `GitHub: ${owner}/${repo}\nBaşlık: ${title}\nAçıklama: ${description}\nVeri: ${JSON.stringify(data).slice(0, 4500)}`.slice(0, MAX_AI_TEXT) };
};

const fetchTwitter = async (url: URL): Promise<FetchedContent> => {
  const match = url.pathname.match(/^\/([\w]+)\/status\/(\d+)/);
  if (!match) throw new Error('Geçerli bir X gönderi adresi gerekli.');
  const data = JSON.parse(await requestText(`https://api.fxtwitter.com/${encodeURIComponent(match[1])}/status/${match[2]}`, { 'User-Agent': 'Orbit-Hub' })) as { tweet?: { text?: string; author?: { name?: string; screen_name?: string; avatar_url?: string }; media?: { all?: { type?: string; url?: string; thumbnail_url?: string }[]; photos?: { url?: string }[] } } };
  if (!data.tweet) throw new Error('X gönderisi bulunamadı.');
  const tweet = data.tweet;
  const media = Array.isArray(tweet.media?.all) ? tweet.media.all : [];
  const images = media.flatMap(item => item.type === 'photo' && item.url ? [item.url] : item.type === 'video' && item.thumbnail_url ? [item.thumbnail_url] : []).slice(0, 8);
  if (!images.length) images.push(...(tweet.media?.photos ?? []).flatMap(item => item.url ? [item.url] : []).slice(0, 8));
  const username = tweet.author?.screen_name || match[1];
  return { title: `@${username}`, author: tweet.author?.name, thumbnailUrl: images[0] || tweet.author?.avatar_url, images, content: `Yazar: ${tweet.author?.name ?? ''} (@${username})\nGönderi: ${tweet.text ?? ''}` };
};

const fetchGeneric = async (url: URL): Promise<FetchedContent> => {
  // Jina Reader fetches the public page for us; the Worker never connects to a user-selected host.
  const text = await requestText(`https://r.jina.ai/${url.toString()}`, { Accept: 'text/plain', 'X-Return-Format': 'text' });
  const title = text.split('\n').map(line => line.replace(/^#+\s*/, '').trim()).find(Boolean) || url.hostname;
  const imageMatch = text.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/);
  return { title, content: text.slice(0, MAX_AI_TEXT), thumbnailUrl: imageMatch?.[1], images: [] };
};

const analyze = async (url: URL, platform: HubPlatform, fetched: FetchedContent): Promise<HubAnalysis> => {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return { url: url.toString(), platform, title: fetched.title, summary: fetched.content.replace(/\s+/g, ' ').slice(0, 420), thumbnailUrl: fetched.thumbnailUrl, author: fetched.author, categories: [], mainCategory: 'Diğer', embedded: [], images: fetched.images };
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: `Bu içeriği Türkçe analiz et. Yalnızca şu JSON'u döndür: {"title":"80 karakteri geçmeyen başlık","summary":"3-4 cümle özet","mainCategory":"Yapay Zeka|Yazılım Geliştirme|GitHub|Haberler|Araçlar|Tasarım|İş Dünyası|Diğer","categories":["en fazla 4 etiket"]}\nPlatform: ${platform}\nURL: ${url.toString()}\nİçerik:\n${fetched.content.slice(0, MAX_AI_TEXT)}` }] }),
  });
  if (!response.ok) throw new Error('AI özeti şu anda üretilemedi.');
  const envelope = JSON.parse(await readLimited(response, 80_000)) as { choices?: { message?: { content?: string } }[] };
  const raw = envelope.choices?.[0]?.message?.content;
  if (!raw) throw new Error('AI boş yanıt verdi.');
  const result = JSON.parse(raw) as { title?: unknown; summary?: unknown; mainCategory?: unknown; categories?: unknown };
  return {
    url: url.toString(), platform,
    title: typeof result.title === 'string' && result.title.trim() ? result.title.trim().slice(0, 120) : fetched.title,
    summary: typeof result.summary === 'string' ? result.summary.trim().slice(0, 1600) : '',
    mainCategory: typeof result.mainCategory === 'string' ? result.mainCategory.trim().slice(0, 80) : 'Diğer',
    categories: Array.isArray(result.categories) ? result.categories.filter((item): item is string => typeof item === 'string').map(item => item.slice(0, 50)).slice(0, 4) : [],
    thumbnailUrl: fetched.thumbnailUrl, author: fetched.author, embedded: [], images: fetched.images,
  };
};

export async function POST(request: Request) {
  if (!authenticatedUser()) return unauthorized();
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Geçersiz istek kaynağı.' }, { status: 403 });
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_REQUEST_BYTES) return json({ error: 'İstek çok büyük.' }, { status: 413 });
  try {
    const body = await request.json() as { url?: unknown };
    const url = normalizeUrl(body.url);
    if (!url) return json({ error: 'Geçerli bir web adresi gerekli.' }, { status: 400 });
    const platform = platformFor(url.hostname);
    const fetched = platform === 'youtube' ? await fetchYoutube(url) : platform === 'twitter' ? await fetchTwitter(url) : platform === 'github' ? await fetchGithub(url) : await fetchGeneric(url);
    return json(await analyze(url, platform, fetched));
  } catch (error) {
    console.error(JSON.stringify({ event: 'hub_analyze_failed', message: error instanceof Error ? error.message : 'unknown' }));
    return json({ error: error instanceof Error ? error.message : 'Bağlantı analiz edilemedi.' }, { status: 422 });
  }
}
