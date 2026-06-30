import { AppShell } from '@/components/shell/AppShell';
import { RequestsQueueView } from '@/components/team/RequestsQueueView';
import { getTeamFrame } from '@/server/shell';
import { getTeamRequests } from '@/server/team';
import { formatWeekdayDate } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function TeamRequestsPage() {
  const { shell } = await getTeamFrame();
  const requests = await getTeamRequests();
  return (
    <AppShell
      side="team"
      portalLabel={shell.portalLabel}
      nav={shell.nav}
      footer={shell.footer}
      hasUnread={shell.hasUnread}
      eyebrow="REQUESTS"
      title="Requests queue"
      dateText={formatWeekdayDate(new Date())}
    >
      <RequestsQueueView requests={requests} />
    </AppShell>
  );
}
