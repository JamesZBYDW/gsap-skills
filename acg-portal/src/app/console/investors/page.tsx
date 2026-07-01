import { AppShell } from '@/components/shell/AppShell';
import { InvestorsView } from '@/components/team/InvestorsView';
import { getTeamFrame } from '@/server/shell';
import { getInvestorsRoster } from '@/server/team';
import { formatWeekdayDate } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function InvestorsPage() {
  const { shell } = await getTeamFrame();
  const investors = await getInvestorsRoster();
  return (
    <AppShell
      side="team"
      portalLabel={shell.portalLabel}
      nav={shell.nav}
      footer={shell.footer}
      eyebrow="INVESTORS"
      title="Investors"
      dateText={formatWeekdayDate(new Date())}
    >
      <InvestorsView investors={investors} />
    </AppShell>
  );
}
