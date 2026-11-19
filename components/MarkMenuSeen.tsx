'use client';

import { useEffect, useRef } from 'react';
import { markMenuSeenAction } from '@/app/actions';

/** Dipasang di halaman Request/Tracker/Dashboard: badge merah menu ini hilang setelah dibuka. */
export function MarkMenuSeen({ menu, pending }: { menu: 'requests' | 'tracker' | 'dashboard'; pending: number }) {
  const sent = useRef(false);
  useEffect(() => {
    if (!pending || sent.current) return;
    sent.current = true;
    markMenuSeenAction(menu).catch(() => {
      sent.current = false;
    });
  }, [menu, pending]);
  return null;
}
