import { AppShell } from '@/components/shell/AppShell';
import { DocumentsView } from '@/components/portal/DocumentsView';
import { getPortalFrame } from '@/server/shell';
import { getDocuments } from '@/server/portal';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  const { investorId, shell, readOnlyLabel } = await getPortalFrame();
  const documents = await getDocuments(investorId);
  return (
    <AppShell
      side="investor"
      portalLabel={shell.portalLabel}
      nav={shell.nav}
      footer={shell.footer}
      eyebrow="DOCUMENTS"
      title="Documents"
      readOnlyLabel={readOnlyLabel}
    >
      <DocumentsView documents={documents} />
    </AppShell>
  );
}
