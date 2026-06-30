import { AppShell } from '@/components/shell/AppShell';
import { MessagesView } from '@/components/portal/MessagesView';
import { getPortalFrame } from '@/server/shell';
import { getInvestorMessages } from '@/server/portal';

export const dynamic = 'force-dynamic';

export default async function MessagesPage() {
  const { investorId, shell, readOnly, readOnlyLabel } = await getPortalFrame();
  const messages = await getInvestorMessages(investorId);
  return (
    <AppShell
      side="investor"
      portalLabel={shell.portalLabel}
      nav={shell.nav}
      footer={shell.footer}
      hasUnread={shell.hasUnread}
      eyebrow="MESSAGES"
      title="Investor Relations"
      readOnlyLabel={readOnlyLabel}
      fill
    >
      <MessagesView messages={messages} readOnly={readOnly} />
    </AppShell>
  );
}
