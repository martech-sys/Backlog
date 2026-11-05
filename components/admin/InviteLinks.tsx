'use client';

import { useState } from 'react';

/** Daftar link undangan dengan tombol salin (dipakai bila email belum terkirim). */
export function InviteLinks({ links }: { links: { email: string; nama: string; link: string; detail: string }[] }) {
  const [copied, setCopied] = useState('');
  return (
    <div className="stack" style={{ gap: 6, marginTop: 8 }}>
      {links.map((l) => (
        <div key={l.email} className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          <span className="subtle" style={{ minWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.email}>
            {l.nama || l.email}
          </span>
          <input type="text" readOnly value={l.link} onFocus={(e) => e.currentTarget.select()} style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }} />
          <button
            type="button"
            className="btn small"
            onClick={() => {
              void navigator.clipboard?.writeText(l.link);
              setCopied(l.email);
            }}
          >
            {copied === l.email ? 'Tersalin' : 'Salin'}
          </button>
        </div>
      ))}
      <span className="subtle">Link berlaku 72 jam dan hanya bisa dipakai sekali. Kirim ke masing-masing user secara pribadi.</span>
    </div>
  );
}
