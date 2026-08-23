import { env } from 'cloudflare:workers';
import { ORBIT_STATE_TABLE_SQL } from './schema';

type OrbitBindings = {
  DB: D1Database;
};

export function getDatabase(): D1Database {
  const database = (env as unknown as OrbitBindings).DB;

  if (!database) {
    throw new Error('Cloudflare D1 binding "DB" is not available.');
  }

  return database;
}

export async function ensureOrbitSchema(database = getDatabase()) {
  await database.prepare(ORBIT_STATE_TABLE_SQL).run();
  return database;
}
