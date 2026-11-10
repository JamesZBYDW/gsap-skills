import { AppShell } from '@/components/shell/AppShell';
import { CreateAccountView } from '@/components/team/CreateAccountView';
import { getTeamFrame } from '@/server/shell';
import { formatWeekdayDate } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function CreateAccountPage() {
  const { shell } = await getTeamFrame();
  return (
    <AppShell
      side="team"
      portalLabel={shell.portalLabel}
      nav={shell.nav}
      footer={shell.footer}
      eyebrow="INVESTORS"
      title="Create account"
      dateText={formatWeekdayDate(new Date())}
    >
      <CreateAccountView />
    </AppShell>
  );
}
