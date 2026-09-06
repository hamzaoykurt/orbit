import { authenticatedUser } from '../../../../../auth/context';
import { accountId, database, isFitnessSyncEntitled, orbitAccountLabel, requiredBinding, safeErrorCode, sendFitnessCallback } from '../../../../../integrations/profitness/server';
import { validLinkState } from '../../../../../integrations/profitness/protocol';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

function page(title: string, body: string, status = 200) {
  return new Response(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(title)}</title><style>body{margin:0;background:#0b0d10;color:#f5f7fa;font:16px system-ui;display:grid;min-height:100vh;place-items:center}.card{width:min(520px,calc(100% - 40px));background:#15191f;padding:32px;border-radius:24px;box-shadow:0 24px 80px #0008}h1{font-size:28px;margin:0 0 12px}p{color:#b8c0cc;line-height:1.6}button,a{display:inline-flex;min-height:48px;align-items:center;justify-content:center;border:0;border-radius:14px;padding:0 20px;font-weight:700;text-decoration:none}.primary{background:#f36a21;color:#111}.secondary{color:#f5f7fa;background:#252b34;margin-left:8px}.meta{font-size:13px}</style></head><body><main class="card">${body}</main></body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' },
  });
}

function parameters(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state'), callback = url.searchParams.get('callback_url'), fitnessUserId = url.searchParams.get('fitness_user_id');
  if (!validLinkState(state) || !fitnessUserId || !UUID.test(fitnessUserId)) return null;
  try {
    const expected = new URL(requiredBinding('ORBIT_PROFITNESS_CALLBACK_URL'));
    if (expected.protocol !== 'https:' || callback !== expected.href) return null;
  } catch { return null; }
  return { state, fitnessUserId };
}

export async function GET(request: Request) {
  if (!authenticatedUser()) return page('Oturum gerekli', '<h1>Orbit oturumu gerekli.</h1>', 401);
  const input = parameters(request);
  if (!input) return page('Geçersiz bağlantı', '<h1>Bağlantı isteği geçersiz.</h1><p>Fitness uygulamasına dönüp bağlantıyı yeniden başlat.</p>', 400);
  const entitled = isFitnessSyncEntitled();
  return page('Fitness bağlantısı', `<h1>Fitness’i Orbit’e bağla</h1><p>Orbit yalnız haftalık hedef, tamamlanan seans sayısı ve bugünün durumunu okuyacak. Program ve antrenman kayıtlarının sahibi Fitness olarak kalır.</p><p class="meta">Premium Fitness Sync: <strong>${entitled ? 'Etkin' : 'Bu hesapta etkin değil'}</strong></p><form method="post" action="/api/integrations/profitness/connect"><input type="hidden" name="state" value="${escape(input.state)}"><input type="hidden" name="fitness_user_id" value="${escape(input.fitnessUserId)}"><button class="primary" type="submit" ${entitled ? '' : 'disabled'}>İzin ver ve bağla</button><a class="secondary" href="/">Vazgeç</a></form>`);
}

export async function POST(request: Request) {
  if (!authenticatedUser()) return page('Oturum gerekli', '<h1>Orbit oturumu gerekli.</h1>', 401);
  if (Number(request.headers.get('content-length') ?? 0) > 8192) return page('İstek çok büyük', '<h1>Bağlantı isteği reddedildi.</h1>', 413);
  try {
    const form = await request.formData();
    const state = form.get('state'), fitnessUserId = form.get('fitness_user_id');
    if (typeof state !== 'string' || !validLinkState(state) || typeof fitnessUserId !== 'string' || !UUID.test(fitnessUserId)) {
      return page('Geçersiz bağlantı', '<h1>Bağlantı isteği geçersiz.</h1><p>Fitness uygulamasından yeniden başlat.</p>', 400);
    }
    if (!isFitnessSyncEntitled()) return page('Premium gerekli', '<h1>Fitness Sync etkin değil.</h1><p>Bu özellik yalnız Orbit Premium capability ile açılır.</p>', 403);
    const orbitAccountId = await accountId();
    const existing = await database().prepare(`SELECT fitness_user_id FROM orbit_profitness_links
      WHERE orbit_account_id = ? AND status = 'connected'`).bind(orbitAccountId).first<{ fitness_user_id: string }>();
    if (existing && existing.fitness_user_id !== fitnessUserId) {
      return page('Bağlantı zaten var', '<h1>Orbit başka bir Fitness hesabına bağlı.</h1><p>Önce mevcut bağlantıyı Yönet ekranından kaldır.</p><a class="primary" href="/api/integrations/profitness/manage">Bağlantıyı yönet</a>', 409);
    }
    await database().prepare(`INSERT INTO orbit_profitness_links
      (fitness_user_id, orbit_account_id, status, fitness_sync_entitled) VALUES (?, ?, 'pending', 1)
      ON CONFLICT(fitness_user_id) DO UPDATE SET orbit_account_id = excluded.orbit_account_id,
      status = 'pending', fitness_sync_entitled = 1, updated_at = CURRENT_TIMESTAMP`)
      .bind(fitnessUserId, orbitAccountId).run();
    const callback = await sendFitnessCallback({
      eventId: crypto.randomUUID(), type: 'connection.updated', state, fitnessUserId,
      orbitAccountId, accountLabel: orbitAccountLabel(), authorized: true, fitnessSyncEntitled: true,
      manageUrl: `${new URL(request.url).origin}/api/integrations/profitness/manage`,
    });
    if (!callback.ok) {
      console.error(JSON.stringify({ event: 'profitness_connect_callback_failed', status: callback.status }));
      return page('Bağlantı tamamlanamadı', '<h1>Fitness’e güvenli yanıt ulaştırılamadı.</h1><p>Biraz sonra Fitness uygulamasından yeniden dene.</p>', 502);
    }
    await database().prepare(`UPDATE orbit_profitness_links SET status = 'connected', updated_at = CURRENT_TIMESTAMP
      WHERE fitness_user_id = ? AND orbit_account_id = ?`).bind(fitnessUserId, orbitAccountId).run();
    return page('Bağlantı tamamlandı', '<h1>Fitness bağlandı.</h1><p>Rebuild SPORT bundan sonra Fitness’taki gerçek tamamlanma kayıtlarından güncellenecek. Bu pencereyi kapatabilirsin.</p><a class="primary" href="/">Orbit’e dön</a>');
  } catch (error) {
    console.error(JSON.stringify({ event: 'profitness_connect_failed', code: safeErrorCode(error) }));
    return page('Bağlantı tamamlanamadı', '<h1>Güvenli bağlantı şu anda kurulamıyor.</h1><p>Secret veya servis yapılandırması eksik olabilir.</p>', 503);
  }
}
