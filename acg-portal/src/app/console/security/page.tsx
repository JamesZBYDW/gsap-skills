import { AppShell } from '@/components/shell/AppShell';
import { MfaSettings } from '@/components/security/MfaSettings';
import { getTeamFrame } from '@/server/shell';
import { getMfaStatus } from '@/server/mfa';
import { db } from '@/server/db/client';

export const dynamic = 'force-dynamic';

export default async function TeamSecurityPage() {
  const { actor, shell } = await getTeamFrame();
  const status = await getMfaStatus(db(), actor.user.id);
  return (
    <AppShell side="team" portalLabel={shell.portalLabel} nav={shell.nav} footer={shell.footer} eyebrow="CONSOLE" title="Sign-in security">
      <MfaSettings
        vm={{ enabled: status.enabled, enabledAt: status.enabledAt?.toISOString() ?? null, recoveryCodesRemaining: status.recoveryCodesRemaining }}
        readOnly={false}
      />
    </AppShell>
  );
}
