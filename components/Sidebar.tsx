'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { logoutAction } from '@/app/actions';
import { Icon } from './icons';
import { ThemeToggle } from './ThemeToggle';

export interface SideItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  /** Tampil sebagai tombol utama (mis. Request baru). */
  primary?: boolean;
  group?: 'admin';
}

function isActive(path: string, href: string): boolean {
  const base = href.split('?')[0];
  if (base === '/requests') return path === '/requests' || /^\/requests\/(?!new)/.test(path);
  return path === base || path.startsWith(`${base}/`);
}

/** Navigasi utama: sidebar gelap berikon di desktop, menu lipat di layar kecil. */
export function Sidebar({ items, user }: { items: SideItem[]; user: { name: string; role: string } }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  const link = (i: SideItem) => (
    <Link key={i.href} href={i.href} className={`${i.primary ? 'primary' : ''}${isActive(path, i.href) ? ' active' : ''}`} aria-current={isActive(path, i.href) ? 'page' : undefined}>
      <Icon name={i.icon} />
      <span className="lbl">{i.label}</span>
      {i.badge ? (
        <span className="nav-badge" title={`${i.badge} tugas menunggu kamu`}>
          {i.badge > 99 ? '99+' : i.badge}
        </span>
      ) : null}
    </Link>
  );
  const main = items.filter((i) => !i.group && !i.primary);
  const admin = items.filter((i) => i.group === 'admin');
  const primary = items.filter((i) => i.primary);
  const badge = items.find((i) => i.badge)?.badge || 0;

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="side-top">
        <Link href="/" className="side-brand">
          <span className="brand-mark">CR</span>
          <span className="lbl">Creative Tracker</span>
        </Link>
        <button type="button" className="side-menu-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? 'Tutup menu' : 'Buka menu'}>
          <Icon name={open ? 'close' : 'menu'} size={22} />
          {!open && badge ? <span className="nav-badge">{badge > 99 ? '99+' : badge}</span> : null}
        </button>
      </div>
      <div className="side-body">
        {primary.length ? <div className="side-primary">{primary.map(link)}</div> : null}
        <nav className="side-nav" aria-label="Menu utama">
          {main.map(link)}
          {admin.length ? (
            <>
              <div className="side-section">Admin</div>
              {admin.map(link)}
            </>
          ) : null}
        </nav>
        <div className="side-user">
          <Link href="/akun" className={`side-who${isActive(path, '/akun') ? ' active' : ''}`} title="Akun saya">
            <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
            <span className="who-text">
              <strong>{user.name}</strong>
              <small>{user.role}</small>
            </span>
          </Link>
          <div className="side-actions">
            <ThemeToggle />
            <form action={logoutAction}>
              <button className="btn small side-logout" type="submit" title="Keluar">
                <Icon name="logout" size={15} /> Keluar
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}
