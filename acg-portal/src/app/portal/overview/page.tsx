import { AppShell } from '@/components/shell/AppShell';
import { OverviewView } from '@/components/portal/OverviewView';
import { getPortalFrame } from '@/server/shell';
import { getOverview } from '@/server/portal';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const { investorId, shell, readOnlyLabel } = await getPortalFrame();
  const vm = await getOverview(investorId);
  return (
    <AppShell
      side="investor"
      portalLabel={shell.portalLabel}
      nav={shell.nav}
      footer={shell.footer}
      eyebrow="OVERVIEW"
      title={`Good morning, ${vm.greetingName}`}
      readOnlyLabel={readOnlyLabel}
    >
      <OverviewView vm={vm} />
    </AppShell>
  );
}
