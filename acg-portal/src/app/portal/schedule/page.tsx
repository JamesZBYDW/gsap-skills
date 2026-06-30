import { AppShell } from '@/components/shell/AppShell';
import { ScheduleView } from '@/components/portal/ScheduleView';
import { getPortalFrame } from '@/server/shell';
import { getSchedule } from '@/server/portal';

export const dynamic = 'force-dynamic';

export default async function SchedulePage() {
  const { investorId, shell, readOnlyLabel } = await getPortalFrame();
  const vm = await getSchedule(investorId);
  return (
    <AppShell
      side="investor"
      portalLabel={shell.portalLabel}
      nav={shell.nav}
      footer={shell.footer}
      hasUnread={shell.hasUnread}
      eyebrow="SCHEDULE"
      title="Distribution schedule"
      readOnlyLabel={readOnlyLabel}
    >
      <ScheduleView vm={vm} />
    </AppShell>
  );
}
