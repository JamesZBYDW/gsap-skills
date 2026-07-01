import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { AuthGate } from '@/components/auth/AuthGate';
import { ToastProvider } from '@/components/ui/Toast';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(user.role === 'TEAM' ? '/console/overview' : '/portal/overview');

  // Do NOT prefill a real investor's email here — a hardcoded default made every
  // investor sign-in land on the seeded sample account. Prefill only when an
  // explicit demo email is configured; otherwise the field starts empty.
  return (
    <ToastProvider>
      <AuthGate defaultEmail={process.env.DEMO_LOGIN_EMAIL ?? ''} />
    </ToastProvider>
  );
}
