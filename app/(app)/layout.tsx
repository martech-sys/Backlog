import { Sidebar, type SideItem } from '@/components/Sidebar';
import { env } from '@/lib/env';
import { myTasks } from '@/lib/mine';
import { getDb, requireUser } from '@/lib/session';
import { ROLE_LABEL } from '@/lib/users';
import { can } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const mine = myTasks(await getDb(), user).length;
  const items: SideItem[] = [
    ...(can.submitRequest(user) ? [{ href: '/requests/new', label: 'Request baru', icon: 'plus', primary: true }] : []),
    { href: '/backlog', label: 'Team Backlog', icon: 'board', badge: mine },
    { href: '/dashboard', label: 'Dashboard', icon: 'chart' },
    { href: mine ? '/tracker?view=bola' : '/tracker', label: 'Tracker', icon: 'list', badge: mine },
    { href: '/requests', label: 'Request', icon: 'inbox' },
    { href: '/panduan', label: 'Panduan', icon: 'book' },
    ...(user.roles.includes('superadmin')
      ? [
          { href: '/admin/users', label: 'Kelola user', icon: 'users', group: 'admin' as const },
          { href: '/admin/whatsapp', label: 'Pengaturan WA', icon: 'chat', group: 'admin' as const },
        ]
      : []),
  ];
  const mainRole = user.roles.find((r) => r !== 'admin' && r !== 'superadmin') || user.roles[0];
  const akses = user.roles.includes('superadmin') ? ' · Superadmin' : user.roles.includes('admin') ? ' · Admin' : '';
  const role = `${ROLE_LABEL[mainRole]}${mainRole !== 'superadmin' && mainRole !== 'admin' ? akses : ''}${env.demoMode ? ' · DEMO' : ''}`;
  return (
    <div className="shell">
      <Sidebar items={items} user={{ name: user.name, role }} />
      <main className="page wide">{children}</main>
    </div>
  );
}
