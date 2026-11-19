'use client';

import { useState } from 'react';

interface Field {
  key?: string;
  label: string;
  type: string;
  required: boolean;
  options: string;
  split: boolean;
}

const TYPES: [string, string][] = [
  ['text', 'Teks singkat'],
  ['textarea', 'Teks panjang'],
  ['number', 'Angka'],
  ['select', 'Pilihan'],
];

/** Penyusun kolom isian form untuk kategori buatan web. Hasilnya dikirim sebagai JSON di input `fields`. */
export function FieldBuilder({
  initial,
}: {
  initial: { key?: string; label: string; type: string; required?: boolean; options?: string[]; split?: boolean }[];
}) {
  const [fields, setFields] = useState<Field[]>(
    initial.map((f) => ({ key: f.key, label: f.label, type: f.type, required: !!f.required, options: (f.options || []).join(', '), split: !!f.split })),
  );
  const set = (i: number, patch: Partial<Field>) => setFields((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) =>
    setFields((xs) => {
      const j = i + d;
      if (j < 0 || j >= xs.length) return xs;
      const next = [...xs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <div className="field-builder">
      <input
        type="hidden"
        name="fields"
        value={JSON.stringify(
          fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required, options: f.options, split: f.type === 'number' && f.split })),
        )}
      />
      {fields.length === 0 ? <p className="subtle" style={{ margin: 0 }}>Belum ada kolom isian khusus. Form hanya berisi brief umum.</p> : null}
      {fields.map((f, i) => (
        <div className="fb-row" key={i}>
          <input value={f.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Label, mis. Ukuran banner" aria-label={`Label kolom ${i + 1}`} />
          <select value={f.type} onChange={(e) => set(i, { type: e.target.value })} aria-label={`Jenis kolom ${i + 1}`}>
            {TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          {f.type === 'select' ? (
            <input value={f.options} onChange={(e) => set(i, { options: e.target.value })} placeholder="Options, comma separated" aria-label={`Options for field ${i + 1}`} />
          ) : f.type === 'number' ? (
            <label className="fb-req" title="Filled with N → the request becomes N separate tasks in the Tracker">
              <input
                type="checkbox"
                checked={f.split}
                onChange={(e) => setFields((xs) => xs.map((x, j) => ({ ...x, split: j === i ? e.target.checked : e.target.checked ? false : x.split })))}
              />{' '}
              Split into N tasks
            </label>
          ) : (
            <span />
          )}
          <label className="fb-req">
            <input type="checkbox" checked={f.required} onChange={(e) => set(i, { required: e.target.checked })} /> Wajib
          </label>
          <span className="fb-actions">
            <button type="button" className="btn small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Naikkan">
              ↑
            </button>
            <button type="button" className="btn small" onClick={() => move(i, 1)} disabled={i === fields.length - 1} aria-label="Turunkan">
              ↓
            </button>
            <button type="button" className="btn small danger" onClick={() => setFields((xs) => xs.filter((_, j) => j !== i))} aria-label="Hapus kolom">
              ×
            </button>
          </span>
        </div>
      ))}
      {fields.length < 12 ? (
        <div>
          <button type="button" className="btn small" onClick={() => setFields((xs) => [...xs, { label: '', type: 'text', required: false, options: '', split: false }])}>
            + Tambah kolom isian
          </button>
        </div>
      ) : null}
    </div>
  );
}
