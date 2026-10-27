import type { Account } from './account-model';
import { AKSES } from './config';
import { findPerson, findPersonByEmail, type Master, type Person } from './master';
import type { CurrentUser } from './workflow';

export function userFromPerson(p: Person): CurrentUser {
  return { email: p.email, name: p.name, roles: p.roles, grup: p.grup };
}

/**
 * Petakan akun login ke user aplikasi. Peran kerja diambil dari Master_PIC/Master_Tim
 * berdasarkan Nama (atau email bila nama tidak cocok); akses Admin/Superadmin dari tab Users.
 * Akun yang tidak terhubung ke master data menjadi "viewer" (lihat saja).
 */
export function resolveUser(master: Master, acc: Pick<Account, 'email' | 'nama' | 'akses'>): CurrentUser {
  const person = findPerson(master, acc.nama) || findPersonByEmail(master, acc.email);
  const base: CurrentUser =
    person && person.active
      ? { email: acc.email, name: person.name, roles: [...person.roles], grup: person.grup }
      : { email: acc.email, name: acc.nama || acc.email.split('@')[0], roles: ['viewer'], grup: 'Semua' };
  const extra: CurrentUser['roles'] = [];
  if (acc.akses === AKSES.SUPERADMIN) extra.push('superadmin', 'admin');
  if (acc.akses === AKSES.ADMIN || master.config.adminEmails.includes(acc.email)) extra.push('admin');
  base.roles = Array.from(new Set([...extra, ...base.roles.filter((r) => !(r === 'viewer' && extra.length))]));
  return base;
}

export const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  hocp: 'Head of Creative Production',
  head: 'Creative Head',
  traffic: 'Traffic',
  lead: 'Lead divisi',
  tim: 'Tim creative',
  pic: 'PIC brand',
  viewer: 'Viewer',
};
