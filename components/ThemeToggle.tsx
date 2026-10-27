'use client';

import { useEffect, useState } from 'react';

/** Tombol ganti tema terang/gelap. Pilihan disimpan di browser masing-masing user. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.dataset.theme === 'dark'), []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    try {
      localStorage.setItem('ct_theme', next ? 'dark' : 'light');
    } catch {
      // mode privat: abaikan
    }
  };

  return (
    <button type="button" className="btn small" onClick={toggle} title={dark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'} aria-label={dark ? 'Mode terang' : 'Mode gelap'}>
      {dark ? '☀️' : '🌙'}
    </button>
  );
}
