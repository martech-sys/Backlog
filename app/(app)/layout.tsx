import Link from 'next/link';
import { demoLogoutAction } from '@/app/actions';
import { Nav } from '@/components/Nav';
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
  ];
  const mainRole = user.roles.find((r) => r !== 'admin') || user.roles[0];
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
            <div className="who">
              <strong>{user.name}</strong>
              <small>
                {ROLE_LABEL[mainRole]}
                {user.roles.includes('admin') && mainRole !== 'admin' ? ' · Admin' : ''}
                {env.demoMode ? ' · DEMO' : ''}
              </small>
            </div>
            {env.demoMode ? (
              <form action={demoLogoutAction}>
                <button className="btn small" type="submit">
                  Ganti user
                </button>
              </form>
            ) : (
              <a className="btn small" href="/api/auth/signout">
                Keluar
              </a>
            )}
          </div>
        </div>
      </header>
      <main className="page wide">{children}</main>
    </>
  );
}
