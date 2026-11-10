import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { getImpersonatedInvestorId } from '@/lib/session';
import { ToastProvider } from '@/components/ui/Toast';
import { ForcedPasswordChange } from '@/components/auth/ForcedPasswordChange';

export const dynamic = 'force-dynamic';

// Forced first-login password set. Reached when an investor is still on the
// management-issued password (mustChangePassword). Lives outside /portal so the
// portal guard's redirect here does not loop.
export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.role !== 'INVESTOR') redirect('/console/overview');
  // Team members impersonating never land here; only real investor sessions.
  const impersonating = await getImpersonatedInvestorId();
  if (impersonating) redirect('/portal/overview');
  if (!user.mustChangePassword) redirect('/portal/overview');

  return (
    <ToastProvider>
      <ForcedPasswordChange />
    </ToastProvider>
  );
}
