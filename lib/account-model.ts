import { AKSES, type Akses, type UserRow } from './config';
import { normalizeEmail } from './master';

export interface Account {
  email: string;
  nama: string;
  akses: Akses;
  hash: string;
  aktif: boolean;
  mustChange: boolean;
  dibuat: string;
  dibuatOleh: string;
  lastLogin: string;
}

const yes = (v: string) => /^(ya|y|yes|true|1)$/i.test(String(v || '').trim());

export function parseAkses(v: string): Akses {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'superadmin') return AKSES.SUPERADMIN;
  if (s === 'admin') return AKSES.ADMIN;
  return AKSES.USER;
}

export function parseAccounts(rows: UserRow[]): Account[] {
  return rows
    .filter((r) => normalizeEmail(r.Email))
    .map((r) => ({
      email: normalizeEmail(r.Email),
      nama: String(r.Nama || '').trim(),
      akses: parseAkses(r.Akses),
      hash: String(r['Password Hash'] || '').trim(),
      aktif: String(r.Aktif || '').trim() === '' || yes(r.Aktif),
      mustChange: yes(r['Wajib Ganti Password']),
      dibuat: r.Dibuat || '',
      dibuatOleh: r['Dibuat Oleh'] || '',
      lastLogin: r['Login Terakhir'] || '',
    }));
}
