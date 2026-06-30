import { AppShell } from '@/components/shell/AppShell';
import { RegistrationsView } from '@/components/team/RegistrationsView';
import { getTeamFrame } from '@/server/shell';
import { getRegistrations } from '@/server/team';
import { formatWeekdayDate } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function RegistrationsPage() {
  const { shell } = await getTeamFrame();
  const registrations = await getRegistrations();
  return (
    <AppShell
      side="team"
      portalLabel={shell.portalLabel}
      nav={shell.nav}
      footer={shell.footer}
      hasUnread={shell.hasUnread}
      eyebrow="REGISTRATIONS"
      title="Pending registrations"
      dateText={formatWeekdayDate(new Date())}
    >
      <RegistrationsView registrations={registrations} />
    </AppShell>
  );
}
