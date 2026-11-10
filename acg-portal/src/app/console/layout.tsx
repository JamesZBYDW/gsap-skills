import { requireTeamView } from '@/lib/auth';
import { ToastProvider } from '@/components/ui/Toast';

export const dynamic = 'force-dynamic';

// Team-side guard. Investors are redirected to their portal by requireTeamView.
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  await requireTeamView();
  return <ToastProvider>{children}</ToastProvider>;
}
