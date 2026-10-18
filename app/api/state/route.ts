import { getDatabase } from '../../../db/client';
import { authenticatedUser, prefetchedStateRow, unauthorized } from '../../../auth/context';
import { clampHubNotes } from '../../hub/hub-model';
import { STATE_SELECT_SQL, WORKSPACE_ID, type StateRow } from './query';

export const dynamic = 'force-dynamic';

const MAX_STATE_BYTES = 512 * 1024;

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export async function GET(request?: Request) {
  if (!authenticatedUser()) return unauthorized();
  // `?rev=N` lets a returning tab ask "anything new?" without downloading the workspace.
  const knownRevision = request ? Number(new URL(request.url).searchParams.get('rev')) : Number.NaN;
  try {
    // The auth gate usually read this row together with the session (one D1 round
    // trip). The table comes from migrations/0001; it is no longer created per request.
    const prefetched = prefetchedStateRow<StateRow>();
    const row = prefetched !== undefined ? prefetched : await getDatabase().prepare(STATE_SELECT_SQL).bind(WORKSPACE_ID).first<StateRow>();

    if (!row) return json({ state: null, revision: 0, updatedAt: null });
    if (Number.isSafeInteger(knownRevision) && knownRevision > 0 && row.revision === knownRevision) return json({ unchanged: true, revision: row.revision });

    return json({
      state: JSON.parse(row.state_json),
      revision: row.revision,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    console.error('D1 state read failed', error);
    return json({ error: 'Veri şu anda yüklenemedi.' }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  if (!authenticatedUser()) return unauthorized();
  const requestOrigin = request.headers.get('origin');
  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return json({ error: 'Geçersiz istek kaynağı.' }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { state?: unknown; revision?: number };
    if (!body.state || typeof body.state !== 'object' || Array.isArray(body.state)) {
      return json({ error: 'Geçerli bir Orbit durumu gerekli.' }, { status: 400 });
    }

    const stateJson = JSON.stringify(clampHubNotes(body.state));
    if (new TextEncoder().encode(stateJson).byteLength > MAX_STATE_BYTES) {
      return json({ error: 'Orbit verisi izin verilen boyutu aşıyor.' }, { status: 413 });
    }

    const database = getDatabase();
    // Compare and write atomically. An old tab must not erase a newer plan.
    const validRevision = Number.isSafeInteger(body.revision) && body.revision! >= 0;
    const metadata = !validRevision ? null : body.revision === 0
      ? await database.prepare(`INSERT INTO orbit_state (workspace_id, state_json, revision, updated_at)
          VALUES (?, ?, 1, CURRENT_TIMESTAMP) ON CONFLICT(workspace_id) DO NOTHING RETURNING revision, updated_at`)
          .bind(WORKSPACE_ID, stateJson).first<{ revision: number; updated_at: string }>()
      : await database.prepare(`UPDATE orbit_state SET state_json = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
          WHERE workspace_id = ? AND revision = ? RETURNING revision, updated_at`)
          .bind(stateJson, WORKSPACE_ID, body.revision).first<{ revision: number; updated_at: string }>();
    if (!metadata) {
      const latest = await database.prepare(STATE_SELECT_SQL).bind(WORKSPACE_ID).first<StateRow>();
      return json({ error: validRevision ? 'Daha yeni değişiklikler var; yeniden eşitleniyor.' : 'Kaydetmeden önce sayfayı yenile.',
        state: latest ? JSON.parse(latest.state_json) : null, revision: latest?.revision ?? 0 }, { status: 409 });
    }
    return json({ saved: true, revision: metadata.revision, updatedAt: metadata.updated_at });
  } catch (error) {
    console.error('D1 state write failed', error);
    return json({ error: 'Veri şu anda kaydedilemedi.' }, { status: 503 });
  }
}
