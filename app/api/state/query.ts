// Shared by the route handler and the auth gate (which prefetches the row
// together with the session so /api/state needs one D1 round trip, not two).
export const WORKSPACE_ID = 'orbit-personal-os';
export const STATE_SELECT_SQL = 'SELECT state_json, revision, updated_at FROM orbit_state WHERE workspace_id = ?';
export type StateRow = { state_json: string; revision: number; updated_at: string };
