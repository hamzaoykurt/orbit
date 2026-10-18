// Cloudflare Workers do not implement fetch(redirect: 'error'). Redirects are followed by hand so that every hop
// is validated again: http(s) only, no credentials, no internal/private hosts, bounded hop count.
export const MAX_REDIRECTS = 5;

export class RedirectError extends Error {
  constructor(message: string) { super(message); this.name = 'RedirectError'; }
}

const PRIVATE_V4 = [/^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^192\.0\.0\./, /^198\.1[89]\./, /^2(2[4-9]|[3-5]\d)\./];

export function isInternalHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan') || host.endsWith('.home.arpa')) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return PRIVATE_V4.some(pattern => pattern.test(host));
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return true;
  if (host.includes(':')) {
    if (host === '::' || host === '::1') return true;
    if (/^(fc|fd|fe[89ab])/.test(host)) return true;
    const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return PRIVATE_V4.some(pattern => pattern.test(mapped[1]));
    if (host.startsWith('::ffff:')) return true;
  }
  return false;
}

export function assertSafeUrl(url: URL) {
  if (!['http:', 'https:'].includes(url.protocol)) throw new RedirectError('Yönlendirme desteklenmeyen bir adrese gitti.');
  if (url.username || url.password) throw new RedirectError('Yönlendirme kimlik bilgisi içeren bir adrese gitti.');
  if (isInternalHost(url.hostname)) throw new RedirectError('Yönlendirme iç ağ veya özel bir adrese gitti; güvenlik nedeniyle durduruldu.');
}

export async function fetchFollowingRedirects(
  input: string | URL,
  init: RequestInit = {},
  options: { transport?: typeof fetch; sameOriginOnly?: boolean; maxRedirects?: number } = {},
): Promise<Response> {
  const transport = options.transport ?? fetch;
  const limit = options.maxRedirects ?? MAX_REDIRECTS;
  let url = new URL(input.toString());
  const origin = url.origin;
  let method = init.method ?? 'GET';
  let body = init.body;
  for (let hop = 0; ; hop++) {
    const response = await transport(url, { ...init, method, body, redirect: 'manual' });
    if (response.status < 300 || response.status >= 400 || response.status === 304) return response;
    const location = response.headers.get('location');
    await response.body?.cancel().catch(() => undefined);
    if (!location) throw new RedirectError('Yönlendirme adresi alınamadı.');
    if (hop >= limit) throw new RedirectError(`Çok fazla yönlendirme (en fazla ${limit}).`);
    let next: URL;
    try { next = new URL(location, url); } catch { throw new RedirectError('Yönlendirme adresi geçersiz.'); }
    assertSafeUrl(next);
    if (options.sameOriginOnly && next.origin !== origin) throw new RedirectError('Yönlendirme başka bir kaynağa gitti; durduruldu.');
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) { method = 'GET'; body = undefined; }
    url = next;
  }
}
