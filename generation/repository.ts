import type { GeneratedIdea, SuggestionType } from '../app/rebuild/idea-engine';
import { GENERATION_SCHEMA } from './schema';

export const LOCK_TTL_MS = 100_000, LOCK_TAKEOVER_MS = 15_000;
export class GenerationRepository {
  constructor(private db: D1Database, private owner: string) {}
  async ensure() { for (const sql of GENERATION_SCHEMA) await this.db.prepare(sql).run(); }
  async all(): Promise<GeneratedIdea[]> {
    const ideas: GeneratedIdea[] = [];
    let before = Number.MAX_SAFE_INTEGER;
    for (;;) {
      const page = await this.db.prepare('SELECT seq, idea_json, status FROM orbit_generation_history WHERE owner = ? AND seq < ? ORDER BY seq DESC LIMIT 500').bind(this.owner, before).all<{ seq: number; idea_json: string; status: GeneratedIdea['status'] }>();
      ideas.push(...page.results.map(row => ({ ...JSON.parse(row.idea_json), status: row.status })));
      if (page.results.length < 500) break;
      before = page.results.at(-1)!.seq;
    }
    return ideas;
  }
  async page(before: number, type?: SuggestionType) {
    const query = this.db.prepare(`SELECT seq, idea_json, status FROM orbit_generation_history WHERE owner = ? AND seq < ?${type ? " AND json_extract(idea_json, '$.type') = ?" : ''} ORDER BY seq DESC LIMIT 31`);
    const page = await (type ? query.bind(this.owner, before, type) : query.bind(this.owner, before)).all<{ seq: number; idea_json: string; status: GeneratedIdea['status'] }>();
    return { items: page.results.slice(0,30).map(row => ({ ...JSON.parse(row.idea_json), status: row.status } as GeneratedIdea)), next: page.results.length > 30 ? String(page.results[29].seq) : null };
  }
  async get(id: string): Promise<GeneratedIdea | null> {
    const row = await this.db.prepare('SELECT idea_json, status FROM orbit_generation_history WHERE owner = ? AND id = ?').bind(this.owner, id).first<{ idea_json: string; status: GeneratedIdea['status'] }>();
    return row ? { ...JSON.parse(row.idea_json), status: row.status } : null;
  }
  async insert(idea: GeneratedIdea, fingerprint: string) {
    const result = await this.db.prepare('INSERT OR IGNORE INTO orbit_generation_history(id, owner, fingerprint, idea_json, generated_at) VALUES (?, ?, ?, ?, ?)').bind(idea.id, this.owner, fingerprint, JSON.stringify(idea), idea.generatedAt).run();
    return result.meta.changes === 1;
  }
  async accept(idea: GeneratedIdea) {
    await this.db.prepare("UPDATE orbit_generation_history SET idea_json = ?, status = 'accepted', accepted_at = ? WHERE owner = ? AND id = ?").bind(JSON.stringify(idea), new Date().toISOString(), this.owner, idea.id).run();
  }
  async decision(id: string, status: 'skipped' | 'rejected') {
    await this.db.prepare("UPDATE orbit_generation_history SET status = ? WHERE owner = ? AND id = ? AND status != 'accepted'").bind(status, this.owner, id).run();
  }
  // One lock per owner AND kind (a stuck research request must not block a project request). The lease is only a little
  // longer than the request budget (95 s in the route). A same-kind request that arrives after LOCK_TAKEOVER_MS takes the
  // lock over: the client only starts a new request after abandoning the old one, so waiting out the lease helps nobody.
  // The old request's release() then no-ops because its token no longer matches.
  private lockKey(kind?: string) { return kind ? `${this.owner}|${kind}` : this.owner; }
  async acquire(token: string, kind?: string) {
    const now = Date.now();
    const result = await this.db.prepare(`INSERT INTO orbit_generation_locks(owner, token, expires_at) VALUES (?, ?, ?)
      ON CONFLICT(owner) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at WHERE orbit_generation_locks.expires_at < ?`).bind(this.lockKey(kind), token, now + LOCK_TTL_MS, now + LOCK_TTL_MS - LOCK_TAKEOVER_MS).run();
    return result.meta.changes === 1;
  }
  async release(token: string, kind?: string) { await this.db.prepare('DELETE FROM orbit_generation_locks WHERE owner = ? AND token = ?').bind(this.lockKey(kind), token).run(); }
  async allowRequest(max = 20) {
    const window = Math.floor(Date.now() / 60_000);
    const result = await this.db.prepare(`INSERT INTO orbit_generation_limits(owner, window, attempts) VALUES (?, ?, 1)
      ON CONFLICT(owner) DO UPDATE SET window = excluded.window, attempts = CASE WHEN orbit_generation_limits.window = excluded.window THEN orbit_generation_limits.attempts + 1 ELSE 1 END
      WHERE orbit_generation_limits.window != excluded.window OR orbit_generation_limits.attempts < ?`).bind(this.owner, window, max).run();
    return result.meta.changes === 1;
  }
}
