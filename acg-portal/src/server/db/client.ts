import 'server-only';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1Database } from './d1';

/** The D1 binding for the current request (Worker env `DB`). */
export function db(): D1Database {
  const env = getCloudflareContext().env as unknown as { DB?: D1Database };
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  return env.DB;
}
