'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Nav({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Menu utama">
      {items.map((i) => {
        const active = i.href === '/requests' ? path === '/requests' || /^\/requests\/(?!new)/.test(path) : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} className={active ? 'active' : ''}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
