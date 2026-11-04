import Link from 'next/link';
import { logoutAction } from '@/app/actions';
import { Nav } from '@/components/Nav';
import { ThemeToggle } from '@/components/ThemeToggle';
import { env } from '@/lib/env';
import { requireUser } from '@/lib/session';
import { ROLE_LABEL } from '@/lib/users';
import { can } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items = [
    { href: '/backlog', label: 'Team Backlog' },
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/tracker', label: 'Tracker' },
    { href: '/requests', label: 'Request' },
    ...(can.submitRequest(user) ? [{ href: '/requests/new', label: '+ Request baru' }] : []),
    { href: '/panduan', label: 'Panduan' },
    ...(user.roles.includes('superadmin') ? [{ href: '/admin/users', label: 'Kelola user' }] : []),
  ];
  const mainRole = user.roles.find((r) => r !== 'admin' && r !== 'superadmin') || user.roles[0];
  const akses = user.roles.includes('superadmin') ? ' · Superadmin' : user.roles.includes('admin') ? ' · Admin' : '';
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand">
            <span className="brand-mark">CR</span>
            <span className="brand-name">Creative Tracker</span>
          </Link>
          <Nav items={items} />
          <div className="userbox">
            <Link href="/akun" className="who" title="Akun saya">
              <strong style={{ color: 'var(--text)' }}>{user.name}</strong>
              <small>
                {ROLE_LABEL[mainRole]}
                {mainRole !== 'superadmin' && mainRole !== 'admin' ? akses : ''}
                {env.demoMode ? ' · DEMO' : ''}
              </small>
            </Link>
            <ThemeToggle />
            <form action={logoutAction}>
              <button className="btn small" type="submit">
                Keluar
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="page wide">{children}</main>
    </>
  );
}
