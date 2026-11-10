import { redirect } from 'next/navigation';
import { getMfaChallengeToken, getSessionUser } from '@/lib/session';
import { MfaChallengeForm } from '@/components/auth/MfaChallengeForm';

export const dynamic = 'force-dynamic';

// Second sign-in step. Reachable only with a pending challenge cookie, which
// is issued after a correct password for an account with 2FA on.
export default async function MfaPage() {
  const user = await getSessionUser();
  if (user) redirect(user.role === 'TEAM' ? '/console/overview' : '/portal/overview');
  if (!(await getMfaChallengeToken())) redirect('/login');
  return <MfaChallengeForm />;
}
