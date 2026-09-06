import { authenticatedUser } from '../../../../../auth/context';
import { currentOwnerHash, database, isFitnessSyncEntitled, json, safeErrorCode } from '../../../../../integrations/profitness/server';
import type { FitnessSummary } from '../../../../../integrations/profitness/protocol';

export const dynamic = 'force-dynamic';

type StatusRow = {
  status: string;
  fitness_sync_entitled: number;
  payload_json: string | null;
  summary_version: number | null;
  received_at: string | null;
};

export async function GET() {
  if (!authenticatedUser()) return json({ code: 'unauthorized' }, { status: 401 });
  try {
    const ownerHash = await currentOwnerHash();
    const row = await database().prepare(`SELECT l.status, l.fitness_sync_entitled,
      s.payload_json, s.summary_version, s.received_at FROM orbit_profitness_account a
      JOIN orbit_profitness_links l ON l.orbit_account_id = a.account_id
      LEFT JOIN orbit_profitness_summaries s ON s.fitness_user_id = l.fitness_user_id
      WHERE a.owner_hash = ? AND l.status = 'connected' LIMIT 1`).bind(ownerHash).first<StatusRow>();
    if (!row) return json({ connected: false, entitled: isFitnessSyncEntitled(), summary: null });
    const entitled = isFitnessSyncEntitled() && Boolean(row.fitness_sync_entitled);
    return json({
      connected: true, entitled,
      summary: entitled && row.payload_json ? JSON.parse(row.payload_json) as FitnessSummary : null,
      version: row.summary_version ?? 0, receivedAt: row.received_at,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'profitness_status_failed', code: safeErrorCode(error) }));
    return json({ code: 'temporarily_unavailable' }, { status: 503 });
  }
}
