import { Sidebar, type SideItem } from '@/components/Sidebar';
import { env } from '@/lib/env';
import { canManageKategori } from '@/lib/kategoriAdmin';
import { myTasks } from '@/lib/mine';
import { getBadges, getDb, requireUser } from '@/lib/session';
import { ROLE_LABEL } from '@/lib/users';
import { can } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const mine = myTasks(await getDb(), user).length;
  const fresh = await getBadges();
  const items: SideItem[] = [
    ...(can.submitRequest(user) ? [{ href: '/requests/new', label: 'New request', icon: 'plus', primary: true }] : []),
    { href: '/backlog', label: 'Team Backlog', icon: 'board', badge: mine, badgeTitle: `${mine} tasks where the ball is with you` },
    {
      href: '/dashboard',
      label: 'Dashboard',
      icon: 'chart',
      badge: fresh.dashboard,
      badgeNew: true,
      badgeTitle: `${fresh.dashboard} task updates since you last opened the dashboard`,
    },
    {
      href: mine ? '/tracker?view=bola' : '/tracker',
      label: 'Tracker',
      icon: 'list',
      badge: fresh.tracker,
      badgeNew: true,
      badgeTitle: `${fresh.tracker} new tasks since you last opened the tracker`,
    },
    {
      href: '/requests',
      label: 'Requests',
      icon: 'inbox',
      badge: fresh.requests,
      badgeNew: true,
      badgeTitle: `${fresh.requests} new requests since you last opened this page`,
    },
    { href: '/panduan', label: 'Guide', icon: 'book' },
    ...(user.roles.includes('superadmin')
      ? [
          { href: '/admin/users', label: 'Manage users', icon: 'users', group: 'admin' as const },
          { href: '/admin/whatsapp', label: 'WhatsApp settings', icon: 'chat', group: 'admin' as const },
        ]
      : []),
    ...(canManageKategori(user) ? [{ href: '/admin/kategori', label: 'Manage categories', icon: 'tag', group: 'admin' as const }] : []),
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
