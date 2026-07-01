// Single source of truth for enum -> human label mappings. Pure + shared
// between server view-models and client components.

import type { InvestorState, DocumentKind } from '@prisma/client';

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
