import { env } from 'cloudflare:workers';
import { authenticatedUser, unauthorized } from '../../../auth/context';
import { imageContentType, readLimitedImage } from './media-validation';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
function mediaBucket(): R2Bucket | null {
  // Storage is optional until R2 is enabled on the production account.
  // Do not require a placeholder bucket just to deploy unrelated app changes.
  const binding: unknown = Reflect.get(env, 'MEDIA');
  if (!binding || typeof binding !== 'object' || !('put' in binding) || !('get' in binding)) return null;
  if (typeof binding.put !== 'function' || typeof binding.get !== 'function') return null;
  return binding as R2Bucket;
}
const storageUnavailable = () => json({ error: 'Fotoğraf depolaması henüz etkin değil. Çizimin korunuyor; depolama ve güvenli giriş kurulunca yükleyebilirsin.' }, 503);
async function ownerPrefix() {
  const user = authenticatedUser();
  if (!user) return null;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(user));
  return `project-media/${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')}/`;
}
export async function POST(request: Request) {
  if (!authenticatedUser()) return unauthorized();
  const media = mediaBucket();
  if (!media) return storageUnavailable();
  const prefix = await ownerPrefix();
  if (!prefix) return json({ error: 'Fotoğraf eklemek için oturum açmalısın.' }, 401);
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Geçersiz istek kaynağı.' }, 403);
  try {
    const bytes = await readLimitedImage(request);
    const contentType = imageContentType(bytes);
    if (!contentType || contentType !== request.headers.get('content-type')?.split(';')[0]) return json({ error: 'Geçerli bir JPG, PNG veya WebP fotoğraf seç.' }, 415);
    const id = crypto.randomUUID();
    await media.put(`${prefix}${id}`, bytes, { httpMetadata: { contentType } });
    return json({ id, url: `/api/project-media?id=${id}`, createdAt: new Date().toISOString() }, 201);
  } catch (error) {
    return json({ error: error instanceof Error && error.message === 'too-large' ? 'Fotoğraf en fazla 10 MB olabilir.' : 'Fotoğraf yüklenemedi. Çizimin korunuyor; tekrar deneyebilirsin.' }, error instanceof Error && error.message === 'too-large' ? 413 : 503);
  }
}
export async function GET(request: Request) {
  if (!authenticatedUser()) return unauthorized();
  const media = mediaBucket();
  if (!media) return storageUnavailable();
  const prefix = await ownerPrefix();
  if (!prefix) return json({ error: 'Oturum gerekli.' }, 401);
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return json({ error: 'Fotoğraf bulunamadı.' }, 404);
  try {
    const object = await media.get(`${prefix}${id}`);
    if (!object) return json({ error: 'Fotoğraf bulunamadı.' }, 404);
    return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return json({ error: 'Fotoğraf şu anda yüklenemedi.' }, 503); }
}
