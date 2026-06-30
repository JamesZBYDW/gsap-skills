// Pill tone resolution. Tones map to the .pill--* CSS classes. Pure + shared
// between server view-models and client components.

import type { RequestStatus, InvestorState } from '@prisma/client';
import type { DistributionDisplayStatus } from './schedule';

export type Tone = 'ok' | 'info' | 'warn' | 'mute';

export function requestStatusTone(status: RequestStatus): Tone {
  switch (status) {
    case 'APPROVED':
    case 'COMPLETED':
      return 'ok';
    case 'PENDING_REVIEW':
    case 'IN_REVIEW':
      return 'info';
    case 'NEEDS_INFO':
      return 'warn';
    case 'DECLINED':
      return 'mute';
  }
}

export function investorStateTone(state: InvestorState): Tone {
  switch (state) {
    case 'ACTIVE':
      return 'ok';
    case 'AWAITING':
      return 'info';
    case 'PENDING':
      return 'warn';
    case 'DECLINED':
      return 'mute';
  }
}

export function distributionTone(status: DistributionDisplayStatus): Tone {
  switch (status) {
    case 'PAID':
      return 'ok';
    case 'NEXT':
      return 'info';
    case 'UPCOMING':
      return 'mute';
  }
}

export const distributionStatusLabel: Record<DistributionDisplayStatus, string> = {
  PAID: 'Paid',
  NEXT: 'Next',
  UPCOMING: 'Upcoming',
};
