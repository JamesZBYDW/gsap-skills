import { AppShell } from '@/components/shell/AppShell';
import { MfaSettings } from '@/components/security/MfaSettings';
import { getPortalFrame } from '@/server/shell';
import { getMfaStatus } from '@/server/mfa';
import { getInvestor } from '@/server/db/repo';
import { getSessionUser } from '@/lib/session';
import { db } from '@/server/db/client';

export const dynamic = 'force-dynamic';

export default async function InvestorSecurityPage() {
  const { investorId, shell, readOnly, readOnlyLabel } = await getPortalFrame();
  const database = db();
  // While Investor Relations views the portal read-only, show the investor's
  // status without controls; otherwise the signed-in investor's own settings.
  const userId = readOnly ? (await getInvestor(database, investorId))?.userId ?? null : (await getSessionUser())!.id;
  const status = userId ? await getMfaStatus(database, userId) : { enabled: false, enabledAt: null, recoveryCodesRemaining: 0 };
  return (
    <AppShell
      side="investor"
      portalLabel={shell.portalLabel}
      nav={shell.nav}
      footer={shell.footer}
      eyebrow="SECURITY"
      title="Sign-in security"
      readOnlyLabel={readOnlyLabel}
    >
      <MfaSettings
        vm={{ enabled: status.enabled, enabledAt: status.enabledAt?.toISOString() ?? null, recoveryCodesRemaining: status.recoveryCodesRemaining }}
        readOnly={readOnly}
      />
    </AppShell>
  );
}
