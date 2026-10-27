import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';

export default async function Home() {
  const user = await requireUser();
  const isManager = user.roles.some((r) => ['admin', 'hocp', 'head', 'viewer'].includes(r));
  redirect(isManager ? '/dashboard' : '/backlog');
}
