'use client';

import { useMemo, useState } from 'react';

export interface AssigneeOption {
  name: string;
  /** Teks yang ditampilkan, mis. "Desainer A · Desain · 1/4 aktif". */
  label: string;
}

/** Pilih anggota dari satu daftar (semua tim, tanpa pengelompokan divisi) dengan pencarian nama. */
export function AssigneePicker({ options, current }: { options: AssigneeOption[]; current: string }) {
  const [q, setQ] = useState('');
  const [value, setValue] = useState('');
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k ? options.filter((o) => o.label.toLowerCase().includes(k)) : options;
  }, [q, options]);
  const selected = shown.some((o) => o.name === value) ? value : shown.length === 1 ? shown[0].name : '';

  return (
    <>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Cari nama (${options.length} anggota)…`}
        aria-label="Cari anggota"
        autoComplete="off"
      />
      <select name="assignee" required value={selected} onChange={(e) => setValue(e.target.value)} aria-label="Pilih anggota">
        <option value="" disabled>
          {shown.length ? 'Pilih anggota…' : 'Tidak ada nama yang cocok'}
        </option>
        {shown.map((o) => (
          <option key={o.name} value={o.name} disabled={o.name === current}>
            {o.label}
            {o.name === current ? ' (saat ini)' : ''}
          </option>
        ))}
      </select>
    </>
  );
}
