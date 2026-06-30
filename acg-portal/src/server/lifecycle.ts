import 'server-only';
import type { RequestStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { deriveRateBps } from '@/lib/rates';
import { monthlyDistributionCents } from '@/lib/money';
import { generateSchedule, computeMaturity } from '@/lib/schedule';
import { formatDate } from '@/lib/dates';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/http';

// ─── Registrations → investors ──────────────────────────────────────────────

/** Approve a pending registration: create an Awaiting investor + note. */
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

// ─── Investor creation + wire ─────────────────────────────────────────────

export async function addInvestor(
  input: { name: string; email?: string; type: 'INDIVIDUAL' | 'ENTITY'; principalCents: number | null; termMonths: number },
  actorUserId: string,
  ip: string | null,
) {
  const rateBps = deriveRateBps(input.termMonths);
  const principalCents = input.principalCents ?? 0;

  const investor = await prisma.$transaction(async (tx) => {
    const inv = await tx.investor.create({
      data: {
        legalName: input.name,
        type: input.type,
        email: input.email ?? '',
        state: 'AWAITING',
      },
    });
    await tx.note.create({
      data: {
        investorId: inv.id,
        principalCents,
        rateBps,
        termMonths: input.termMonths,
        monthlyAmountCents: monthlyDistributionCents(principalCents, rateBps),
        status: 'AWAITING',
      },
    });
    return inv;
  });

  await audit({ action: 'INVESTOR_CREATE', actorUserId, targetType: 'Investor', targetId: investor.id, ip });
  return investor;
}

/**
 * Record the wire: activate the note and generate its distribution schedule
 * from the wire date (now). Distributions are forward-dated and unpaid.
 */
export async function recordWire(investorId: string, actorUserId: string, ip: string | null, now = new Date()) {
  const investor = await prisma.investor.findUnique({ where: { id: investorId }, include: { note: true } });
  if (!investor) throw new HttpError(404, 'Investor not found.');
  if (!investor.note) throw new HttpError(400, 'Investor has no note terms to activate.');
  if (investor.state === 'ACTIVE') throw new HttpError(400, 'Note is already active.');
  if (investor.state === 'DECLINED') throw new HttpError(400, 'Cannot activate a declined investor.');

  const note = investor.note;
  const maturity = computeMaturity(now, note.termMonths);
  const schedule = generateSchedule(now, note.termMonths, note.distributionDay, note.monthlyAmountCents);

  await prisma.$transaction(async (tx) => {
    await tx.investor.update({ where: { id: investorId }, data: { state: 'ACTIVE' } });
    await tx.note.update({
      where: { id: note.id },
      data: {
        status: 'ACTIVE',
        wireDate: now,
        firstDistributionDate: schedule[0]?.dueDate ?? null,
        maturityDate: maturity,
      },
    });
    await tx.distribution.deleteMany({ where: { noteId: note.id } });
    await tx.distribution.createMany({
      data: schedule.map((d) => ({ noteId: note.id, index: d.index, dueDate: d.dueDate, amountCents: d.amountCents })),
    });
  });

  await audit({ action: 'WIRE_RECORDED', actorUserId, targetType: 'Investor', targetId: investorId, metadata: { wireDate: now.toISOString() }, ip });
  await audit({ action: 'INVESTOR_STATE_CHANGE', actorUserId, targetType: 'Investor', targetId: investorId, metadata: { to: 'ACTIVE' }, ip });
}

// ─── Requests workflow ──────────────────────────────────────────────────────

const STATUS_HISTORY_LABEL: Record<Exclude<RequestStatus, 'PENDING_REVIEW'>, string> = {
  APPROVED: 'Approved by Investor Relations',
  COMPLETED: 'Completed',
  NEEDS_INFO: 'More information requested',
  DECLINED: 'Declined',
  IN_REVIEW: 'In review',
};

export async function advanceRequest(
  requestId: string,
  status: Exclude<RequestStatus, 'PENDING_REVIEW'>,
  actorUserId: string,
  ip: string | null,
) {
  const existing = await prisma.request.findUnique({ where: { id: requestId }, include: { history: true } });
  if (!existing) throw new HttpError(404, 'Request not found.');

  // Terminal states cannot be re-opened or re-decided.
  if (existing.status === 'COMPLETED' || existing.status === 'DECLINED') {
    throw new HttpError(409, 'This request is already finalized.');
  }
  if (existing.status === status) {
    throw new HttpError(409, `Request is already ${status.toLowerCase().replace('_', ' ')}.`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.request.update({ where: { id: requestId }, data: { status } });
    await tx.requestHistory.create({
      data: {
        requestId,
        label: STATUS_HISTORY_LABEL[status],
        dateText: formatDate(new Date()),
        done: true,
        order: existing.history.length,
      },
    });
  });

  await audit({ action: 'REQUEST_STATUS_CHANGE', actorUserId, targetType: 'Request', targetId: requestId, metadata: { status }, ip });
}

// ─── Messaging (team) ─────────────────────────────────────────────────────

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
