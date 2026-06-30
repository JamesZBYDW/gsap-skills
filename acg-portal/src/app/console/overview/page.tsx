import { AppShell } from '@/components/shell/AppShell';
import { TeamOverviewView } from '@/components/team/TeamOverviewView';
import { getTeamFrame } from '@/server/shell';
import { getTeamOverview } from '@/server/team';
import { formatWeekdayDate } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function TeamOverviewPage() {
  const { shell } = await getTeamFrame();
  const vm = await getTeamOverview();
  return (
    <AppShell
      side="team"
      portalLabel={shell.portalLabel}
      nav={shell.nav}
      footer={shell.footer}
      hasUnread={shell.hasUnread}
      eyebrow="CONSOLE"
      title="Portfolio overview"
      dateText={formatWeekdayDate(new Date())}
    >
      <TeamOverviewView vm={vm} />
    </AppShell>
  );
}
