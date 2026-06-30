import { AppShell } from '@/components/shell/AppShell';
import { RequestsView } from '@/components/portal/RequestsView';
import { getPortalFrame } from '@/server/shell';
import { getInvestorRequests } from '@/server/portal';

export const dynamic = 'force-dynamic';

export default async function RequestsPage() {
  const { investorId, shell, readOnlyLabel } = await getPortalFrame();
  const requests = await getInvestorRequests(investorId);
  return (
    <AppShell
      side="investor"
      portalLabel={shell.portalLabel}
      nav={shell.nav}
      footer={shell.footer}
      hasUnread={shell.hasUnread}
      eyebrow="REQUESTS"
      title="Your requests"
      readOnlyLabel={readOnlyLabel}
    >
      <RequestsView requests={requests} />
    </AppShell>
  );
}
