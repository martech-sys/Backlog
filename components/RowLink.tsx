'use client';

import { useRouter } from 'next/navigation';

/** Baris tabel yang bisa diklik di mana saja (tetap sediakan <Link> di dalamnya untuk keyboard & tab baru). */
export function RowLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr
      className={`clickable${className ? ` ${className}` : ''}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a,button,input,select,textarea,summary')) return;
        if (e.metaKey || e.ctrlKey) window.open(href, '_blank');
        else router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
