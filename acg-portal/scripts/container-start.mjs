// Container entrypoint for the production image.
//
//   MIGRATE_ON_START          default "1": run `prisma migrate deploy` before
//                             starting (the Docker / Cloudflare Tunnel setup).
//                             The Cloudflare Containers Worker sets "0":
//                             migrations are applied from an operator's machine.
//   REQUIRE_EXTERNAL_DATABASE "1" (set by the Containers Worker): refuse to
//                             start unless DATABASE_URL is a remote Postgres
//                             with verified TLS. The container disk is
//                             ephemeral, so a local database would lose data.
//
// Never prints DATABASE_URL or any secret.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`container-start: ${message}`);
  process.exit(1);
}

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) fail('DATABASE_URL is not set.');

if (process.env.REQUIRE_EXTERNAL_DATABASE === '1') {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail('DATABASE_URL is not a valid URL.');
  }
  const host = url.hostname.toLowerCase();
  const local =
    !host ||
    ['localhost', 'db', 'postgres', '0.0.0.0', '::1', '[::1]'].includes(host) ||
    host.startsWith('127.') ||
    host.endsWith('.local') ||
    host.endsWith('.internal');
  if (local) fail('DATABASE_URL must point at an external managed Postgres, not this container.');
  if (url.searchParams.get('sslmode') !== 'require' || url.searchParams.get('sslaccept') !== 'strict') {
    fail('DATABASE_URL must use sslmode=require&sslaccept=strict (verified TLS).');
  }
}

if ((process.env.MIGRATE_ON_START ?? '1') !== '0') {
  const result = spawnSync(process.execPath, [join(appDir, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: appDir,
    stdio: 'inherit',
  });
  if (result.status !== 0) fail('prisma migrate deploy failed.');
}

// Next.js standalone server (CommonJS); reads PORT/HOSTNAME from the env.
await import(join(appDir, 'server.js'));
