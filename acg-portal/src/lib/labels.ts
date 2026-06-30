// Single source of truth for enum -> human label/icon mappings. Display copy is
// taken verbatim from the prototype (the visual source of truth).

import type {
  RequestType,
  RequestStatus,
  InvestorState,
  DocumentKind,
} from '@prisma/client';

export const requestTypeLabel: Record<RequestType, string> = {
  ADD_CAPITAL: 'Add capital',
  UPDATE_BANKING: 'Banking',
  MATURITY_ELECTION: 'Maturity',
  DOCUMENT: 'Document',
  UPDATE_PROFILE: 'Profile',
  NOTIF_PREFS: 'Notification preferences',
  GENERAL: 'General',
};

// Default titles when an investor starts a request from a preset chip.
export const requestTypeTitle: Record<RequestType, string> = {
  ADD_CAPITAL: 'Add capital to note',
  UPDATE_BANKING: 'Update ACH details',
  MATURITY_ELECTION: 'Maturity election',
  DOCUMENT: 'Request a document',
  UPDATE_PROFILE: 'Update profile',
  NOTIF_PREFS: 'Notification preferences',
  GENERAL: 'General request',
};

// Glyphs mirror the prototype's _icon() map.
export const requestTypeIcon: Record<RequestType, string> = {
  ADD_CAPITAL: '＋',
  UPDATE_BANKING: '⛁',
  MATURITY_ELECTION: '↻',
  DOCUMENT: '▤',
  UPDATE_PROFILE: '⌂',
  NOTIF_PREFS: '◉',
  GENERAL: '•',
};

export const requestStatusLabel: Record<RequestStatus, string> = {
  PENDING_REVIEW: 'Pending review',
  IN_REVIEW: 'In review',
  NEEDS_INFO: 'Needs info',
  APPROVED: 'Approved',
  COMPLETED: 'Completed',
  DECLINED: 'Declined',
};

export const investorStateLabel: Record<InvestorState, string> = {
  ACTIVE: 'Active',
  AWAITING: 'Awaiting',
  PENDING: 'Pending',
  DECLINED: 'Declined',
};

export const documentKindLabel: Record<DocumentKind, string> = {
  STATEMENT: 'Statement',
  SUMMARY: 'Summary',
  TAX: 'Tax',
  AGREEMENT: 'Agreement',
};

/** A request is "open" (counts toward queues) when not terminal. */
export function isOpenRequestStatus(status: RequestStatus): boolean {
  return status === 'PENDING_REVIEW' || status === 'NEEDS_INFO' || status === 'IN_REVIEW';
}

// Compliance note attached to banking-change requests (verbatim from prototype).
export const BANKING_PHONE_NOTE =
  'For your security, banking changes are confirmed by phone before they take effect.';
