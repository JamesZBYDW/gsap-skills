import { AppShell } from '@/components/shell/AppShell';
import { ProfileView } from '@/components/portal/ProfileView';
import { getPortalFrame } from '@/server/shell';
import { getProfile } from '@/server/portal';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const { investorId, shell, readOnlyLabel } = await getPortalFrame();
  const vm = await getProfile(investorId);
  return (
    <AppShell
      side="investor"
      portalLabel={shell.portalLabel}
      nav={shell.nav}
      footer={shell.footer}
      hasUnread={shell.hasUnread}
      eyebrow="PROFILE"
      title="Account & profile"
      readOnlyLabel={readOnlyLabel}
    >
      <ProfileView vm={vm} />
    </AppShell>
  );
}
