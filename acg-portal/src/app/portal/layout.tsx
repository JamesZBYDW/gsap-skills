import { requireInvestorView } from '@/lib/auth';
import { ToastProvider } from '@/components/ui/Toast';

export const dynamic = 'force-dynamic';

// Investor-side guard + toast provider. Team users only reach here while a
// read-only impersonation is active (requireInvestorView enforces that).
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  await requireInvestorView();
  return <ToastProvider>{children}</ToastProvider>;
}
