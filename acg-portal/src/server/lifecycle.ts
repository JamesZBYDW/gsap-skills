import 'server-only';
import { prisma } from '@/lib/db';
import { generateScheduleBetween, computeMaturity } from '@/lib/schedule';
import { monthlyDistributionCents } from '@/lib/money';
import { parseISODate } from '@/lib/dates';
import { hashPassword, verifyPassword } from '@/lib/password';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/http';
import type { NoteTermsInput, CreateAccountInput } from '@/lib/validation';

// ─── Investor creation ────────────────────────────────────────────────────

/** Create an investor shell (Awaiting). Note terms + login are set separately. */
export async function addInvestor(
  input: { name: string; email: string; type: 'INDIVIDUAL' | 'ENTITY' },
  actorUserId: string,
  ip: string | null,
) {
  const investor = await prisma.investor.create({
    data: { legalName: input.name, type: input.type, email: input.email, state: 'AWAITING' },
  });
  await audit({ action: 'INVESTOR_CREATE', actorUserId, targetType: 'Investor', targetId: investor.id, ip });
  return investor;
}

/**
 * Create an entire investor account in one step: the investor record, its note
 * terms (and generated schedule when Active), and the sign-in credentials the
 * investor will use. The login-email clash is checked up front so a taken email
 * fails before any record is written.
 */
export async function createInvestorAccount(
  input: CreateAccountInput,
  actorUserId: string,
  ip: string | null,
) {
  const loginEmail = (input.loginEmail ?? input.email).toLowerCase();
  if (!loginEmail.includes('@')) throw new HttpError(400, 'A valid login email is required.');
  const clash = await prisma.user.findUnique({ where: { email: loginEmail } });
  if (clash) throw new HttpError(409, 'That login email is already in use.');

  const investor = await addInvestor({ name: input.name, email: input.email, type: input.type }, actorUserId, ip);
  await setNoteTerms(
    investor.id,
    {
      principal: input.principal,
      ratePercent: input.ratePercent,
      status: input.status,
      termMonths: input.termMonths,
      wireReceivedDate: input.wireReceivedDate,
      firstDistributionDate: input.firstDistributionDate,
    },
    actorUserId,
    ip,
  );
  await provisionCredentials(
    investor.id,
    { email: loginEmail, password: input.password, mustChange: input.mustChange },
    actorUserId,
    ip,
  );
  return investor;
}

// ─── Note terms (management sets these; drives the investor schedule) ────────

export async function setNoteTerms(
  investorId: string,
  input: NoteTermsInput,
  actorUserId: string,
  ip: string | null,
) {
  const investor = await prisma.investor.findUnique({ where: { id: investorId }, include: { note: true } });
  if (!investor) throw new HttpError(404, 'Investor not found.');

  const rateBps = Math.round(input.ratePercent * 100);
  const principalCents = input.principal ?? 0;
  const termMonths = input.termMonths;
  // Per-distribution amount is derived from principal × rate ÷ 12 (auto-populated
  // in the UI, recomputed authoritatively here).
  const amountCents = monthlyDistributionCents(principalCents, rateBps);
  const wireDate = parseISODate(input.wireReceivedDate);
  const first = parseISODate(input.firstDistributionDate);
  // Maturity is the term anniversary of the wire-received date.
  const maturity = wireDate ? computeMaturity(wireDate, termMonths) : null;
  const active = input.status === 'ACTIVE';

  if (active) {
    if (!wireDate) throw new HttpError(400, 'Active notes need a wire-received date.');
    if (!first) throw new HttpError(400, 'Active notes need a first distribution date.');
    if (principalCents <= 0) throw new HttpError(400, 'Enter the principal to activate the note.');
    if (maturity && first > maturity) throw new HttpError(400, 'First distribution must be on or before maturity.');
  }

  // Distributions land on the first date, then every 30 days through maturity.
  const planned = active && first && maturity ? generateScheduleBetween(first, amountCents, maturity) : [];
  const noteStatus = active ? 'ACTIVE' : 'AWAITING';

  const noteData = {
    principalCents,
    rateBps,
    termMonths,
    monthlyAmountCents: amountCents,
    wireDate,
    firstDistributionDate: first,
    distributionDay: first ? first.getUTCDate() : 1,
    maturityDate: maturity,
    status: noteStatus as 'ACTIVE' | 'AWAITING',
  };

  await prisma.$transaction(async (tx) => {
    await tx.investor.update({ where: { id: investorId }, data: { state: input.status } });
    const note = await tx.note.upsert({
      where: { investorId },
      create: { investorId, ...noteData },
      update: noteData,
    });
    await tx.distribution.deleteMany({ where: { noteId: note.id } });
    if (active && planned.length) {
      await tx.distribution.createMany({
        data: planned.map((d) => ({ noteId: note.id, index: d.index, dueDate: d.dueDate, amountCents: d.amountCents })),
      });
    }
  });

  await audit({
    action: 'NOTE_TERMS_SET',
    actorUserId,
    targetType: 'Investor',
    targetId: investorId,
    metadata: { status: input.status, rateBps, principalCents, amountCents, distributions: active ? planned.length : 0 },
    ip,
  });
  await audit({ action: 'INVESTOR_STATE_CHANGE', actorUserId, targetType: 'Investor', targetId: investorId, metadata: { to: input.status }, ip });
}

// ─── Credentials ─────────────────────────────────────────────────────────────

/** Management provisions or resets an investor's login. */
export async function provisionCredentials(
  investorId: string,
  input: { email?: string; password: string; mustChange?: boolean },
  actorUserId: string,
  ip: string | null,
) {
  const investor = await prisma.investor.findUnique({ where: { id: investorId }, include: { user: true } });
  if (!investor) throw new HttpError(404, 'Investor not found.');

  const loginEmail = (input.email ?? investor.email).toLowerCase();
  if (!loginEmail || !loginEmail.includes('@')) throw new HttpError(400, 'A valid login email is required.');

  const passwordHash = await hashPassword(input.password);
  const clash = await prisma.user.findUnique({ where: { email: loginEmail } });

  if (investor.user) {
    if (clash && clash.id !== investor.user.id) throw new HttpError(409, 'That email is already used by another login.');
    await prisma.user.update({
      where: { id: investor.user.id },
      data: { email: loginEmail, passwordHash, mustChangePassword: !!input.mustChange, failedLoginAttempts: 0, lockedUntil: null },
    });
  } else {
    if (clash) throw new HttpError(409, 'A login with that email already exists.');
    const user = await prisma.user.create({
      data: { role: 'INVESTOR', name: investor.legalName, email: loginEmail, passwordHash, mustChangePassword: !!input.mustChange },
    });
    await prisma.investor.update({ where: { id: investorId }, data: { userId: user.id } });
  }

  await audit({ action: 'CREDENTIALS_SET', actorUserId, targetType: 'Investor', targetId: investorId, metadata: { email: loginEmail }, ip });
}

/** Investor changes their own password (from Profile; requires the current one). */
export async function changeOwnPassword(userId: string, currentPassword: string, newPassword: string, ip: string | null) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(401, 'Not authenticated.');
  const ok = await verifyPassword(user.passwordHash, currentPassword);
  if (!ok) throw new HttpError(400, 'Current password is incorrect.');
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
  });
  await audit({ action: 'PASSWORD_CHANGE', actorUserId: userId, targetType: 'User', targetId: userId, ip });
}

/**
 * Forced first-login password set. The authenticated session proves identity,
 * so no current password is required — but this only works while the account is
 * still flagged mustChangePassword (i.e. still on its management-issued password).
 */
export async function setInitialPassword(userId: string, newPassword: string, ip: string | null) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(401, 'Not authenticated.');
  if (!user.mustChangePassword) throw new HttpError(400, 'Password has already been set.');
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
  });
  await audit({ action: 'PASSWORD_CHANGE', actorUserId: userId, targetType: 'User', targetId: userId, metadata: { initial: true }, ip });
}
