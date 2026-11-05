'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Nav({ items }: { items: { href: string; label: string; badge?: number }[] }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Menu utama">
      {items.map((i) => {
        const active = i.href === '/requests' ? path === '/requests' || /^\/requests\/(?!new)/.test(path) : path.startsWith(i.href.split('?')[0]);
        return (
          <Link key={i.href} href={i.href} className={active ? 'active' : ''}>
            {i.label}
            {i.badge ? (
              <span className="nav-badge" title={`${i.badge} tugas menunggu kamu`}>
                {i.badge > 99 ? '99+' : i.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
