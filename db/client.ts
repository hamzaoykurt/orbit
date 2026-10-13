import { env } from 'cloudflare:workers';

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

// Tables come from migrations/ (npm run db:migrate:*). Never run DDL per request.
