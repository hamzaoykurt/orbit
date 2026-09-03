import { env } from 'cloudflare:workers';
import { authenticatedUser, unauthorized } from '../../../auth/context';
import { imageContentType, readLimitedImage } from './media-validation';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
function mediaStore(): KVNamespace | null {
  const binding: unknown = Reflect.get(env, 'MEDIA');
  if (!binding || typeof binding !== 'object' || !('put' in binding) || !('getWithMetadata' in binding)) return null;
  if (typeof binding.put !== 'function' || typeof binding.getWithMetadata !== 'function') return null;
  return binding as KVNamespace;
}
const storageUnavailable = () => json({ error: 'Görsel depolaması şu anda kullanılamıyor. Çizimin korunuyor; tekrar deneyebilirsin.' }, 503);
async function ownerPrefix() {
  const user = authenticatedUser();
  if (!user) return null;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(user));
  return `project-media/${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')}/`;
}
export async function POST(request: Request) {
  if (!authenticatedUser()) return unauthorized();
  const media = mediaStore();
  if (!media) return storageUnavailable();
  const prefix = await ownerPrefix();
  if (!prefix) return json({ error: 'Fotoğraf eklemek için oturum açmalısın.' }, 401);
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Geçersiz istek kaynağı.' }, 403);
  try {
    const bytes = await readLimitedImage(request);
    const contentType = imageContentType(bytes);
    if (!contentType || contentType !== request.headers.get('content-type')?.split(';')[0]) return json({ error: 'Geçerli bir JPG, PNG veya WebP fotoğraf seç.' }, 415);
    const id = crypto.randomUUID();
    await media.put(`${prefix}${id}`, bytes, { metadata: { contentType } });
    return json({ id, url: `/api/project-media?id=${id}`, createdAt: new Date().toISOString() }, 201);
  } catch (error) {
    return json({ error: error instanceof Error && error.message === 'too-large' ? 'Fotoğraf en fazla 10 MB olabilir.' : 'Fotoğraf yüklenemedi. Çizimin korunuyor; tekrar deneyebilirsin.' }, error instanceof Error && error.message === 'too-large' ? 413 : 503);
  }
}
export async function GET(request: Request) {
  if (!authenticatedUser()) return unauthorized();
  const media = mediaStore();
  if (!media) return storageUnavailable();
  const prefix = await ownerPrefix();
  if (!prefix) return json({ error: 'Oturum gerekli.' }, 401);
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return json({ error: 'Fotoğraf bulunamadı.' }, 404);
  try {
    const object = await media.getWithMetadata<{ contentType?: string }>(`${prefix}${id}`, 'arrayBuffer');
    if (!object.value) return json({ error: 'Fotoğraf bulunamadı.' }, 404);
    return new Response(object.value, { headers: { 'Content-Type': object.metadata?.contentType ?? 'application/octet-stream', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return json({ error: 'Fotoğraf şu anda yüklenemedi.' }, 503); }
}
