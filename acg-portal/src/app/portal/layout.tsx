import { requireInvestorView } from '@/lib/auth';
import { ToastProvider } from '@/components/ui/Toast';
import { ComposerProvider } from '@/components/portal/ComposerProvider';

export const dynamic = 'force-dynamic';

// Investor-side guard + providers. Team users only reach here while a read-only
// impersonation is active (requireInvestorView enforces that).
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { readOnly } = await requireInvestorView();
  return (
    <ToastProvider>
      <ComposerProvider readOnly={readOnly}>{children}</ComposerProvider>
    </ToastProvider>
  );
}
