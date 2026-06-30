import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { AuthGate } from '@/components/auth/AuthGate';
import { ToastProvider } from '@/components/ui/Toast';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(user.role === 'TEAM' ? '/console/overview' : '/portal/overview');

  return (
    <ToastProvider>
      <AuthGate defaultEmail={process.env.SEED_INVESTOR_EMAIL ?? 'm.vance@gmail.com'} />
    </ToastProvider>
  );
}
