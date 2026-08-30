import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../dist/server/wrangler.json', import.meta.url), 'utf8'));
assert.equal(config.name, 'personalos', 'Production must target the personalos Worker.');
assert.equal(config.d1_databases?.find(binding => binding.binding === 'DB')?.database_id, '93606aee-098c-4e2d-af46-21c1d10a207f', 'Keep the existing production database.');
assert.ok(!(config.r2_buckets ?? []).some(binding => binding.bucket_name === 'site-creator-r2'), 'A Sites placeholder bucket must never block the production deploy.');
assert.equal(config.keep_vars, true, 'Preserve dashboard-managed production variables.');
assert.equal(config.assets?.run_worker_first, true, 'Authentication must run before static assets can be served.');
console.log('Production configuration verified: personalos / os.cosmibit.com.');
