import 'server-only';
import { prisma } from '@/lib/db';
import { deriveRateBps } from '@/lib/rates';
import { monthlyDistributionCents } from '@/lib/money';
import { generateScheduleBetween } from '@/lib/schedule';
import { parseISODate } from '@/lib/dates';
import { hashPassword, verifyPassword } from '@/lib/password';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/http';
import type { NoteTermsInput } from '@/lib/validation';

// ─── Registrations → investors ──────────────────────────────────────────────

/** Approve a pending registration: create an Awaiting investor + note terms. */
export async function approveRegistration(registrationId: string, actorUserId: string, ip: string | null) {
  const reg = await prisma.registration.findUnique({ where: { id: registrationId } });
  if (!reg || reg.status !== 'PENDING') throw new HttpError(404, 'Registration not found.');

  const rateBps = deriveRateBps(reg.termMonths);
  const principalCents = reg.intendedPrincipalCents ?? 0;

  const investor = await prisma.$transaction(async (tx) => {
    const inv = await tx.investor.create({
      data: {
        legalName: reg.name,
        type: reg.type,
        email: reg.email,
        state: 'AWAITING',
        accreditationAcknowledged: reg.acknowledgedAccredited,
        accreditationConfirmedAt: reg.acknowledgedAccredited ? new Date() : null,
      },
    });
    await tx.note.create({
      data: {
        investorId: inv.id,
        principalCents,
        rateBps,
        termMonths: reg.termMonths,
        monthlyAmountCents: monthlyDistributionCents(principalCents, rateBps),
        status: 'AWAITING',
      },
    });
    await tx.registration.update({
      where: { id: registrationId },
      data: { status: 'APPROVED', reviewedAt: new Date(), reviewedByUserId: actorUserId },
    });
    return inv;
  });

  await audit({ action: 'REGISTRATION_APPROVE', actorUserId, targetType: 'Investor', targetId: investor.id, metadata: { registrationId }, ip });
  await audit({ action: 'INVESTOR_CREATE', actorUserId, targetType: 'Investor', targetId: investor.id, ip });
  return investor;
}

/** Decline a registration and record a Declined investor in the roster. */
export async function declineRegistration(registrationId: string, actorUserId: string, ip: string | null) {
  const reg = await prisma.registration.findUnique({ where: { id: registrationId } });
  if (!reg || reg.status !== 'PENDING') throw new HttpError(404, 'Registration not found.');

  await prisma.$transaction(async (tx) => {
    await tx.investor.create({
      data: { legalName: reg.name, type: reg.type, email: reg.email, state: 'DECLINED' },
    });
    await tx.registration.update({
      where: { id: registrationId },
      data: { status: 'DECLINED', reviewedAt: new Date(), reviewedByUserId: actorUserId },
    });
  });

  await audit({ action: 'REGISTRATION_DECLINE', actorUserId, targetType: 'Registration', targetId: registrationId, ip });
}

export async function requestMoreInfo(registrationId: string, actorUserId: string, ip: string | null) {
  const reg = await prisma.registration.findUnique({ where: { id: registrationId } });
  if (!reg || reg.status !== 'PENDING') throw new HttpError(404, 'Registration not found.');
  await prisma.registration.update({ where: { id: registrationId }, data: { infoRequested: true } });
  await audit({ action: 'REGISTRATION_INFO_REQUEST', actorUserId, targetType: 'Registration', targetId: registrationId, ip });
}

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
  const amountCents = input.distributionAmount ?? 0;
  const first = parseISODate(input.firstDistributionDate);
  const maturity = parseISODate(input.maturityDate);
  const active = input.status === 'ACTIVE';

  if (active) {
    if (!first || !maturity) throw new HttpError(400, 'Active notes need a first distribution date and maturity date.');
    if (maturity < first) throw new HttpError(400, 'Maturity date must be on or after the first distribution date.');
    if (amountCents <= 0) throw new HttpError(400, 'Enter a distribution amount to activate the note.');
  }

  // The full planned schedule (length is independent of the amount).
  const planned = first && maturity ? generateScheduleBetween(first, input.distributionDay, amountCents, maturity) : [];
  const termMonths = planned.length || investor.note?.termMonths || 0;
  const noteStatus = active ? 'ACTIVE' : 'AWAITING';

  const noteData = {
    principalCents,
    rateBps,
    termMonths,
    monthlyAmountCents: amountCents,
    wireDate: active ? investor.note?.wireDate ?? first : investor.note?.wireDate ?? null,
    firstDistributionDate: first,
    distributionDay: input.distributionDay,
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

/** Investor changes their own password. */
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

// ─── Messaging ─────────────────────────────────────────────────────────────

export async function sendTeamMessage(investorId: string, text: string, authorName: string, actorUserId: string, ip: string | null) {
  const investor = await prisma.investor.findUnique({ where: { id: investorId }, select: { id: true } });
  if (!investor) throw new HttpError(404, 'Investor not found.');
  const msg = await prisma.message.create({
    data: { investorId, author: 'TEAM', authorName, text, readByTeam: true, readByInvestor: false },
  });
  await audit({ action: 'MESSAGE_SEND', actorUserId, targetType: 'Message', targetId: msg.id, ip });
  return msg;
}

export async function markThreadReadByTeam(investorId: string) {
  await prisma.message.updateMany({
    where: { investorId, author: 'INVESTOR', readByTeam: false },
    data: { readByTeam: true },
  });
}

export async function broadcast(text: string, authorName: string, actorUserId: string, ip: string | null) {
  const active = await prisma.investor.findMany({ where: { state: 'ACTIVE' }, select: { id: true } });
  if (active.length > 0) {
    await prisma.message.createMany({
      data: active.map((i) => ({
        investorId: i.id,
        author: 'TEAM' as const,
        authorName,
        text,
        readByTeam: true,
        readByInvestor: false,
      })),
    });
  }
  await audit({ action: 'BROADCAST_SEND', actorUserId, metadata: { recipients: active.length }, ip });
  return active.length;
}
