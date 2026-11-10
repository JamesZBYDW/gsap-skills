import { redirect } from 'next/navigation';
import { requireInvestorView } from '@/lib/auth';
import { ToastProvider } from '@/components/ui/Toast';

export const dynamic = 'force-dynamic';

// Investor-side guard + toast provider. Team users only reach here while a
// read-only impersonation is active (requireInvestorView enforces that).
// A real investor still on their management-issued password is forced to set a
// new one before they can reach any portal page.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { actor, readOnly } = await requireInvestorView();
  if (!readOnly && actor.user.mustChangePassword) redirect('/change-password');
  return <ToastProvider>{children}</ToastProvider>;
}
