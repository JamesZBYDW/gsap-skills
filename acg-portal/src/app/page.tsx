import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  redirect(user.role === 'TEAM' ? '/console/overview' : '/portal/overview');
}
