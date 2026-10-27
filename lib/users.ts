import { env } from './env';
import { findPersonByEmail, normalizeEmail, type Master, type Person } from './master';
import type { CurrentUser } from './workflow';

export function userFromPerson(p: Person): CurrentUser {
  return { email: p.email, name: p.name, roles: p.roles, grup: p.grup };
}

export function isAllowedEmail(master: Master | null, email: string): boolean {
  const e = normalizeEmail(email);
  if (!e) return false;
  const domain = e.split('@')[1] || '';
  if (env.allowedDomains.includes(domain)) return true;
  if (env.demoMode && domain === 'demo.local') return true;
  return !!(master && findPersonByEmail(master, e));
}

/**
 * Petakan email login ke user aplikasi. Email yang tidak ada di Master_PIC/Master_Tim
 * tetapi berdomain kantor menjadi "viewer" (lihat dashboard & tracker saja).
 */
export function resolveUser(master: Master, email: string, displayName?: string): CurrentUser | null {
  const e = normalizeEmail(email);
  if (!isAllowedEmail(master, e)) return null;
  const p = findPersonByEmail(master, e);
  if (p && p.active) return userFromPerson(p);
  const roles: CurrentUser['roles'] = master.config.adminEmails.includes(e) ? ['admin', 'viewer'] : ['viewer'];
  return { email: e, name: displayName || e.split('@')[0], roles, grup: 'Semua' };
}

export const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  hocp: 'Head of Creative Production',
  head: 'Creative Head',
  traffic: 'Traffic',
  lead: 'Lead divisi',
  tim: 'Tim creative',
  pic: 'PIC brand',
  viewer: 'Viewer',
};
