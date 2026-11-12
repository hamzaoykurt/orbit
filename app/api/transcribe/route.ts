import { env } from 'cloudflare:workers';
import { authenticatedUser, bearerRequest, unauthorized } from '../../../auth/context';
import { getDatabase } from '../../../db/client';
import { GenerationRepository } from '../../../generation/repository';
import type { ProviderBindings } from '../../../generation/provider';
import { providerFailureCode, providerFailureMessage } from '../../../generation/provider-errors';
import { AUDIO_TYPES, MAX_AUDIO_SECONDS, maxBytesFor, transcribeAudio, wavSeconds } from '../../../generation/transcribe';
export const dynamic = 'force-dynamic';

const PER_MINUTE = 10;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const tooBig = () => json({ error: 'Ses kaydı çok uzun veya büyük. En fazla 5 dakika olabilir (WAV en çok 10 MB, diğer biçimler 8 MB).' }, 413);

// POST /api/transcribe: raw audio body, `?lang=tr` (default), `?hint=` (up to 80 chars). Answers {text}. Nothing is stored or logged.
export async function POST(request: Request) {
  const owner = authenticatedUser();
  if (!owner) return unauthorized();
  const origin = request.headers.get('origin');
  if (!bearerRequest() && origin && origin !== new URL(request.url).origin) return json({ error: 'Geçersiz istek kaynağı.' }, 403);

  const mime = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!(AUDIO_TYPES as readonly string[]).includes(mime)) return json({ error: 'Bu ses biçimi desteklenmiyor. m4a, aac, wav, ogg veya webm kullan.' }, 415);
  const params = new URL(request.url).searchParams;
  const lang = params.get('lang') ?? 'tr';
  if (!/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(lang)) return json({ error: 'Geçersiz dil kodu.' }, 400);
  const hint = (params.get('hint') ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 80);
  if (Number(request.headers.get('content-length') ?? 0) > maxBytesFor(mime)) return tooBig();

  try {
    const limiter = new GenerationRepository(getDatabase(), `transcribe|${owner}`);
    await limiter.ensure();
    if (!await limiter.allowRequest(PER_MINUTE)) return json({ error: 'Çok hızlı istek gönderildi. Bir dakika sonra tekrar dene.' }, 429);
  } catch {
    return json({ error: 'Ses yazıya çevrilemedi. Tekrar dene.' }, 500);
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (reader) {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytesFor(mime)) { await reader.cancel(); return tooBig(); }
        chunks.push(value);
      }
    } catch { return json({ error: 'Ses kaydı okunamadı. Tekrar dene.' }, 400); }
  }
  if (size === 0) return json({ error: 'Ses kaydı boş geldi.' }, 400);
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
  const wav = mime === 'audio/wav' ? wavSeconds(bytes) : null;
  if (wav && wav.seconds > MAX_AUDIO_SECONDS) return tooBig();

  try {
    const text = await transcribeAudio(env as unknown as ProviderBindings, { mime, bytes, lang, hint }, AbortSignal.timeout(50_000));
    return json({ text });
  } catch (error) {
    const code = providerFailureCode(error);
    console.warn('Orbit transcribe failed', code, { bytes: size });
    return json({ error: providerFailureMessage(code) ?? 'Ses yazıya çevrilemedi. Tekrar dene.' }, 502);
  }
}
