/**
 * Daftar kategori yang dipakai form, validasi, dan filter: gabungan kategori bawaan (kolom isian di kode)
 * dengan kategori yang dibuat dari halaman Kelola kategori (kolom isian di Master_Kategori → "Field Form").
 */
import { CATEGORIES, CUSTOM_CATEGORY, type CategoryField } from './config';
import type { Master } from './master';

export interface CategoryInfo {
  name: string;
  subTypes: string[];
  fields: CategoryField[];
  /** Kategori bawaan: kolom isiannya tetap di kode. */
  builtIn: boolean;
  active: boolean;
}

/** Kategori bawaan saja (dipakai bila master data tidak tersedia). */
export const BUILTIN_DEFS: CategoryInfo[] = CATEGORIES.map((c) => ({ ...c, builtIn: true, active: true }));

/**
 * Semua kategori: bawaan dulu (urutan kode), lalu kategori buatan web (urutan sheet).
 * Sub-jenis mengikuti Master_Kategori bila diisi; kategori nonaktif hanya ikut bila `includeInactive`.
 */
export function categoryDefs(master: Pick<Master, 'kategori'> | null | undefined, opts: { includeInactive?: boolean } = {}): CategoryInfo[] {
  if (!master) return BUILTIN_DEFS;
  const rules = master.kategori;
  const out: CategoryInfo[] = [];
  for (const c of CATEGORIES) {
    const rows = rules.filter((r) => r.kategori === c.name);
    if (!rows.length) continue;
    const subs = [...new Set(rows.flatMap((r) => r.subJenis))];
    out.push({
      name: c.name,
      subTypes: c.name === CUSTOM_CATEGORY || !subs.length ? c.subTypes : subs,
      fields: c.fields,
      builtIn: true,
      active: rows.some((r) => r.active),
    });
  }
  for (const r of rules) {
    if (CATEGORIES.some((c) => c.name === r.kategori) || out.some((x) => x.name === r.kategori)) continue;
    const rows = rules.filter((x) => x.kategori === r.kategori);
    out.push({
      name: r.kategori,
      subTypes: [...new Set(rows.flatMap((x) => x.subJenis))],
      fields: rows.find((x) => x.fields)?.fields || [],
      builtIn: false,
      active: rows.some((x) => x.active),
    });
  }
  return opts.includeInactive ? out : out.filter((c) => c.active);
}

export function findCategory(defs: CategoryInfo[], name: string): CategoryInfo | undefined {
  return defs.find((c) => c.name === name);
}

/** Nama field → key aman untuk form (huruf kecil, tanpa spasi), unik dalam satu kategori. */
export function fieldKey(label: string, taken: string[]): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30) || 'kolom';
  let k = base;
  let i = 2;
  while (taken.includes(k)) k = `${base}_${i++}`;
  return k;
}
