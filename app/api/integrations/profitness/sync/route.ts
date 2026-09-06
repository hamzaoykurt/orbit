import { createHash } from 'node:crypto';
import { database, isFitnessSyncEntitled, json, linkFor, readBoundedBody, safeErrorCode, sendFitnessCallback, verifyFitnessServerRequest } from '../../../../../integrations/profitness/server';
import { parseFitnessSyncEnvelope } from '../../../../../integrations/profitness/protocol';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const raw = await readBoundedBody(request);
  if (raw === null) return json({ code: 'payload_too_large' }, { status: 413 });
  try {
    if (!await verifyFitnessServerRequest(request, raw)) return json({ code: 'unauthorized' }, { status: 401 });
    const idempotencyKey = request.headers.get('idempotency-key')?.trim() ?? '';
    if (!/^[A-Za-z0-9._:-]{16,160}$/.test(idempotencyKey)) return json({ code: 'invalid_idempotency_key' }, { status: 400 });
    const envelope = parseFitnessSyncEnvelope(JSON.parse(raw || '{}'));
    if (!envelope) return json({ code: 'invalid_fitness_summary' }, { status: 400 });
    const link = await linkFor(envelope.fitnessUserId);
    if (!link || link.status !== 'connected' || link.orbit_account_id !== envelope.orbitAccountId) {
      return json({ code: 'unknown_connection' }, { status: 403 });
    }
    if (!isFitnessSyncEntitled()) {
      await database().prepare(`UPDATE orbit_profitness_links SET fitness_sync_entitled = 0, updated_at = CURRENT_TIMESTAMP
        WHERE fitness_user_id = ?`).bind(envelope.fitnessUserId).run();
      const callback = await sendFitnessCallback({
        eventId: crypto.randomUUID(), type: 'entitlement.updated', orbitAccountId: envelope.orbitAccountId,
        authorized: true, fitnessSyncEntitled: false,
      });
      if (!callback.ok) console.error(JSON.stringify({ event: 'profitness_entitlement_callback_failed', status: callback.status }));
      return json({ code: 'fitness_sync_not_entitled' }, { status: 403 });
    }

    const payloadHash = createHash('sha256').update(raw).digest('hex');
    const existing = await database().prepare('SELECT payload_hash FROM orbit_profitness_events WHERE idempotency_key = ?')
      .bind(idempotencyKey).first<{ payload_hash: string }>();
    if (existing) return existing.payload_hash === payloadHash
      ? json({ ok: true, duplicate: true })
      : json({ code: 'idempotency_conflict' }, { status: 409 });

    const summary = envelope.summary;
    try {
      const db = database();
      await db.batch([
        db.prepare(`INSERT INTO orbit_profitness_events (idempotency_key, fitness_user_id, payload_hash)
          VALUES (?, ?, ?)`).bind(idempotencyKey, envelope.fitnessUserId, payloadHash),
        db.prepare(`INSERT INTO orbit_profitness_summaries
          (fitness_user_id, payload_json, week_starts_on, completed_this_week, weekly_target, source_updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(fitness_user_id) DO UPDATE SET payload_json = excluded.payload_json,
          summary_version = orbit_profitness_summaries.summary_version + 1, week_starts_on = excluded.week_starts_on,
          completed_this_week = excluded.completed_this_week, weekly_target = excluded.weekly_target,
          source_updated_at = excluded.source_updated_at, received_at = CURRENT_TIMESTAMP`)
          .bind(envelope.fitnessUserId, JSON.stringify(summary), summary.weekStartsOn, summary.completedThisWeek,
            summary.weeklyTarget, request.headers.get('x-fitness-updated-at')),
        db.prepare(`UPDATE orbit_profitness_links SET fitness_sync_entitled = 1, updated_at = CURRENT_TIMESTAMP
          WHERE fitness_user_id = ? AND status = 'connected'`).bind(envelope.fitnessUserId),
      ]);
    } catch (error) {
      const raced = await database().prepare('SELECT payload_hash FROM orbit_profitness_events WHERE idempotency_key = ?')
        .bind(idempotencyKey).first<{ payload_hash: string }>();
      if (raced) return raced.payload_hash === payloadHash
        ? json({ ok: true, duplicate: true })
        : json({ code: 'idempotency_conflict' }, { status: 409 });
      throw error;
    }
    return json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({ event: 'profitness_sync_failed', code: safeErrorCode(error) }));
    return json({ code: safeErrorCode(error) }, { status: 503 });
  }
}
