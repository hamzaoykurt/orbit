import { authenticatedUser } from '../../../../../auth/context';
import { currentOwnerHash, database, isFitnessSyncEntitled, safeErrorCode, sendFitnessCallback } from '../../../../../integrations/profitness/server';

export const dynamic = 'force-dynamic';
type Row = { fitness_user_id: string; orbit_account_id: string; status: string; payload_json: string | null; received_at: string | null };
const page = (body: string, status = 200) => new Response(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Fitness bağlantısı</title><style>body{margin:0;background:#0b0d10;color:#f5f7fa;font:16px system-ui;display:grid;min-height:100vh;place-items:center}.card{width:min(520px,calc(100% - 40px));background:#15191f;padding:32px;border-radius:24px}h1{font-size:28px;margin:0 0 12px}p{color:#b8c0cc;line-height:1.6}button,a{display:inline-flex;min-height:48px;align-items:center;justify-content:center;border:0;border-radius:14px;padding:0 20px;font-weight:700;text-decoration:none}.primary{background:#252b34;color:#f5f7fa}.danger{background:#8f2c2c;color:#fff;margin-left:8px}</style></head><body><main class="card">${body}</main></body></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff' } });

async function ownedLink(): Promise<Row | null> {
  const ownerHash = await currentOwnerHash();
  return database().prepare(`SELECT l.fitness_user_id, l.orbit_account_id, l.status, s.payload_json, s.received_at
    FROM orbit_profitness_account a JOIN orbit_profitness_links l ON l.orbit_account_id = a.account_id
    LEFT JOIN orbit_profitness_summaries s ON s.fitness_user_id = l.fitness_user_id
    WHERE a.owner_hash = ? AND l.status IN ('pending', 'connected') LIMIT 1`).bind(ownerHash).first<Row>();
}

export async function GET() {
  if (!authenticatedUser()) return page('<h1>Orbit oturumu gerekli.</h1>', 401);
  try {
    const link = await ownedLink();
    if (!link) return page('<h1>Fitness bağlı değil.</h1><p>Bağlantıyı Fitness uygulamasındaki Ayarlar → Entegrasyonlar bölümünden başlat.</p><a class="primary" href="/">Orbit’e dön</a>');
    const summary = link.payload_json ? JSON.parse(link.payload_json) as { completedThisWeek?: number; weeklyTarget?: number } : null;
    return page(`<h1>Fitness bağlı.</h1><p>Premium capability: <strong>${isFitnessSyncEntitled() ? 'Etkin' : 'Etkin değil'}</strong></p><p>Haftalık özet: <strong>${summary ? `${summary.completedThisWeek ?? 0} / ${summary.weeklyTarget ?? 0}` : 'İlk eşitleme bekleniyor'}</strong></p><p>Fitness antrenman verisinin tek sahibidir. Orbit yalnız türetilmiş özeti tutar.</p><form method="post" action="/api/integrations/profitness/manage"><a class="primary" href="/">Orbit’e dön</a><button class="danger" type="submit">Bağlantıyı kaldır</button></form>`);
  } catch (error) {
    console.error(JSON.stringify({ event: 'profitness_manage_failed', code: safeErrorCode(error) }));
    return page('<h1>Bağlantı bilgisi açılamıyor.</h1><p>Biraz sonra yeniden dene.</p>', 503);
  }
}

export async function POST(request: Request) {
  if (!authenticatedUser()) return page('<h1>Orbit oturumu gerekli.</h1>', 401);
  if (Number(request.headers.get('content-length') ?? 0) > 1024) return page('<h1>İstek reddedildi.</h1>', 413);
  try {
    const link = await ownedLink();
    if (!link) return page('<h1>Fitness zaten bağlı değil.</h1><a class="primary" href="/">Orbit’e dön</a>');
    const callback = await sendFitnessCallback({
      eventId: crypto.randomUUID(), type: 'connection.updated', orbitAccountId: link.orbit_account_id,
      fitnessUserId: link.fitness_user_id, authorized: false, fitnessSyncEntitled: false,
    });
    if (!callback.ok) return page('<h1>Bağlantı güvenle kaldırılamadı.</h1><p>Fitness tarafına revocation ulaşmadığı için bağlantı korunuyor. Biraz sonra yeniden dene.</p>', 502);
    await database().prepare('DELETE FROM orbit_profitness_links WHERE fitness_user_id = ? AND orbit_account_id = ?')
      .bind(link.fitness_user_id, link.orbit_account_id).run();
    return page('<h1>Fitness bağlantısı kaldırıldı.</h1><p>Fitness geçmişi değişmedi; Orbit’teki türetilmiş özet silindi.</p><a class="primary" href="/">Orbit’e dön</a>');
  } catch (error) {
    console.error(JSON.stringify({ event: 'profitness_manage_disconnect_failed', code: safeErrorCode(error) }));
    return page('<h1>Bağlantı kaldırılamıyor.</h1><p>Biraz sonra yeniden dene.</p>', 503);
  }
}
