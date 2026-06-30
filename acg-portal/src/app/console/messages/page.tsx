import { AppShell } from '@/components/shell/AppShell';
import { TeamMessagesView } from '@/components/team/TeamMessagesView';
import { getTeamFrame } from '@/server/shell';
import { getThreads } from '@/server/team';
import { formatWeekdayDate } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function TeamMessagesPage() {
  const { shell } = await getTeamFrame();
  const threads = await getThreads();
  return (
    <AppShell
      side="team"
      portalLabel={shell.portalLabel}
      nav={shell.nav}
      footer={shell.footer}
      hasUnread={shell.hasUnread}
      eyebrow="MESSAGES"
      title="Messages"
      dateText={formatWeekdayDate(new Date())}
      fill
    >
      <TeamMessagesView threads={threads} />
    </AppShell>
  );
}
