import { env } from 'cloudflare:workers';
import { authenticatedUser, unauthorized } from '../../../../auth/context';
import { isUnreadable, readLimited, requestText, unreadableAnalysis } from '../web-fetch';
import { loadWebContent, type LoadedContent } from '../content-source';
import { buildPrompt, fromContent, fromModel, generateAnalysis, MAX_AI_TEXT, type ModelResult, type ModelRunner } from '../analysis';
import { assertSafeUrl, RedirectError } from '../../../../generation/safe-fetch';
import { HUB_CATEGORIES, type HubPlatform } from '../../../hub/hub-model';

export const dynamic = 'force-dynamic';

const MAX_REQUEST_BYTES = 4096;

const json = (data: unknown, init: ResponseInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
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

const toLoaded = (fetched: FetchedContent): LoadedContent => ({ quality: 'full', source: 'direct', title: fetched.title, description: '', text: fetched.content, thumbnailUrl: fetched.thumbnailUrl, images: fetched.images });

// Platform APIs first (YouTube, GitHub, X); every other page, or an API that cannot be reached, goes through the web chain.
const loadContent = async (url: URL, platform: HubPlatform): Promise<{ loaded: LoadedContent; author?: string }> => {
  const api = platform === 'youtube' ? fetchYoutube : platform === 'twitter' ? fetchTwitter : platform === 'github' ? fetchGithub : null;
  if (api) {
    try { const fetched = await api(url); return { loaded: toLoaded(fetched), author: fetched.author }; }
    catch (error) { if (!isUnreadable(error)) throw error; }
  }
  return { loaded: await loadWebContent(url) };
};

const parseJson = (raw: unknown): ModelResult | null => {
  if (raw && typeof raw === 'object') return raw as ModelResult;
  if (typeof raw !== 'string') return null;
  try { const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); return parsed && typeof parsed === 'object' ? parsed as ModelResult : null; } catch { return null; }
};

const groqRunner = (key: string): ModelRunner => async messages => {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', temperature: 0.2, response_format: { type: 'json_object' }, messages }),
  });
  if (!response.ok) return null;
  const envelope = JSON.parse(await readLimited(response, 80_000)) as { choices?: { message?: { content?: string } }[] };
  return parseJson(envelope.choices?.[0]?.message?.content);
};

type WorkersAi = { run: (model: string, input: Record<string, unknown>) => Promise<{ response?: unknown } | null> };
const analysisSchema = { type: 'object', properties: { title: { type: 'string' }, summary: { type: 'string' }, purpose: { type: 'string' }, category: { type: 'string', enum: [...HUB_CATEGORIES] }, categories: { type: 'array', items: { type: 'string' } } }, required: ['title', 'summary', 'purpose', 'category'] };
// Cloudflare Workers AI: no API key, free daily allowance. Model verified in the Workers AI catalogue (supports JSON mode).
export const WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const workersAiRunner = (ai: WorkersAi): ModelRunner => async messages => {
  const output = await ai.run(WORKERS_AI_MODEL, { messages, max_tokens: 700, temperature: 0.2, response_format: { type: 'json_schema', json_schema: analysisSchema } });
  return parseJson(output?.response);
};

// Order: Groq (when a key exists) -> Workers AI (binding) -> raw page metadata.
const runners = (): ModelRunner[] => {
  const list: ModelRunner[] = [];
  const key = process.env.GROQ_API_KEY?.trim();
  if (key) list.push(groqRunner(key));
  const ai = (env as unknown as { AI?: WorkersAi }).AI;
  if (ai && typeof ai.run === 'function') list.push(workersAiRunner(ai));
  return list;
};

const analyze = async (url: URL, platform: HubPlatform, loaded: LoadedContent, author?: string) => {
  const extra = { thumbnailUrl: loaded.thumbnailUrl, author, images: loaded.images };
  const estimated = loaded.quality === 'none';
  const generated = await generateAnalysis(buildPrompt(url, platform, loaded, estimated), runners());
  if (generated) return fromModel(url, platform, generated.result, loaded, extra, estimated, generated.untranslated);
  return estimated ? unreadableAnalysis(url, platform) : fromContent(url, platform, loaded, extra);
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
    assertSafeUrl(url);
    const platform = platformFor(url.hostname);
    const { loaded, author } = await loadContent(url, platform);
    return json(await analyze(url, platform, loaded, author));
  } catch (error) {
    console.error(JSON.stringify({ event: 'hub_analyze_failed', message: error instanceof Error ? error.message : 'unknown' }));
    if (error instanceof RedirectError) return json({ error: 'Bu adres güvenlik nedeniyle analiz edilemez.' }, { status: 422 });
    return json({ error: error instanceof Error ? error.message : 'Bağlantı analiz edilemedi.' }, { status: 422 });
  }
}
