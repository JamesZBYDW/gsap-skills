// Create (or reset the password of) a Team Console login — without seeding.
//
// Production must never run `db:seed` (it wipes the database and loads demo
// investors). This is the way to get the first management login instead.
//
//   ADMIN_EMAIL=ir@yourdomain.com ADMIN_NAME="Jane Doe" ADMIN_PASSWORD='…' \
//     node prisma/create-admin.mjs
//
// In the Cloudflare/Docker setup:
//   docker compose -f docker-compose.cloudflare.yml --env-file .env.production \
//     exec -e ADMIN_EMAIL=… -e ADMIN_NAME=… -e ADMIN_PASSWORD=… app node prisma/create-admin.mjs
//
// Re-running with the same email resets that login's password and clears any
// lockout. It refuses to touch an email that belongs to an investor login.

import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

// Keep in sync with src/lib/password.ts.
const ARGON2_OPTS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
const name = (process.env.ADMIN_NAME ?? '').trim();
const password = process.env.ADMIN_PASSWORD ?? '';

function fail(message) {
  console.error(`create-admin: ${message}`);
  process.exit(1);
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('set ADMIN_EMAIL to a valid email address.');
if (!name) fail('set ADMIN_NAME (shown in the console footer and audit log).');
if (password.length < 12 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
  fail('set ADMIN_PASSWORD to at least 12 characters with letters and numbers.');
}

const prisma = new PrismaClient();
try {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.role !== 'TEAM') fail(`${email} already belongs to an investor login.`);

  const passwordHash = await hash(password, ARGON2_OPTS);
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { name, passwordHash, failedLoginAttempts: 0, lockedUntil: null },
    });
    // A password reset should end every session opened with the old one.
    await prisma.session.deleteMany({ where: { userId: existing.id } });
    console.log(`Team login updated: ${email}`);
  } else {
    await prisma.user.create({ data: { role: 'TEAM', name, email, passwordHash } });
    console.log(`Team login created: ${email}`);
  }
} finally {
  await prisma.$disconnect();
}
