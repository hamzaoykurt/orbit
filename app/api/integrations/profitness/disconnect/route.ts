import { database, json, readBoundedBody, safeErrorCode, verifyFitnessServerRequest } from '../../../../../integrations/profitness/server';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const raw = await readBoundedBody(request, 8192);
  if (raw === null) return json({ code: 'payload_too_large' }, { status: 413 });
  try {
    if (!await verifyFitnessServerRequest(request, raw)) return json({ code: 'unauthorized' }, { status: 401 });
    const body = JSON.parse(raw || '{}') as Record<string, unknown>;
    const accountId = typeof body.orbitAccountId === 'string' ? body.orbitAccountId.trim() : '';
    const userId = typeof body.fitnessUserId === 'string' ? body.fitnessUserId.trim() : '';
    if (!accountId || accountId.length > 128 || !UUID.test(userId)) return json({ code: 'invalid_disconnect' }, { status: 400 });
    const link = await database().prepare(`SELECT orbit_account_id FROM orbit_profitness_links
      WHERE fitness_user_id = ?`).bind(userId).first<{ orbit_account_id: string }>();
    if (!link) return json({ ok: true, alreadyDisconnected: true });
    if (link.orbit_account_id !== accountId) return json({ code: 'unknown_connection' }, { status: 403 });
    await database().prepare('DELETE FROM orbit_profitness_links WHERE fitness_user_id = ? AND orbit_account_id = ?')
      .bind(userId, accountId).run();
    return json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({ event: 'profitness_disconnect_failed', code: safeErrorCode(error) }));
    return json({ code: safeErrorCode(error) }, { status: 503 });
  }
}
