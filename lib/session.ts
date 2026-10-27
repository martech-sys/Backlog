import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { ENV_VERSION, envSuperadmin, passwordVersion } from './accounts';
import { AKSES } from './config';
import { loadDb, type Db } from './db';
import { getStore } from './store';
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession, type SessionPayload } from './token';
import { resolveUser } from './users';
import type { CurrentUser } from './workflow';

/** Data terbaru untuk satu render halaman (di-cache per request). */
export const getDb = cache(async (): Promise<Db> => loadDb(await getStore()));

/** Sama dengan getDb, ditambah Log_WA (untuk halaman detail). */
export const getDbWithWa = cache(async (): Promise<Db> => loadDb(await getStore(), { withWaLog: true }));

export const getSession = cache(async (): Promise<SessionPayload | null> =>
  verifySession((await cookies()).get(SESSION_COOKIE)?.value),
);

/**
 * User yang sedang login. Token sesi hanya berlaku bila akunnya masih aktif dan
 * password belum diganti/di-reset sejak token dibuat.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await getSession();
  if (!s) return null;
  const db = await getDb();
  const acc = db.accounts.find((a) => a.email === s.e);

  if (s.v === ENV_VERSION) {
    const boot = envSuperadmin();
    if (!boot || boot.email !== s.e) return null;
    if (acc && (!acc.aktif || acc.akses !== AKSES.SUPERADMIN)) return null;
    return resolveUser(db.master, acc || { email: s.e, nama: 'Superadmin', akses: AKSES.SUPERADMIN });
  }
  if (!acc || !acc.aktif || !acc.hash || passwordVersion(acc.hash) !== s.v) return null;
  return resolveUser(db.master, acc);
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect('/login');
  return u;
}

export async function requireSuperadmin(): Promise<CurrentUser> {
  const u = await requireUser();
  if (!u.roles.includes('superadmin')) redirect('/?err=' + encodeURIComponent('Halaman ini khusus Superadmin.'));
  return u;
}

export async function setSessionCookie(p: Omit<SessionPayload, 'x'>): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, await signSession(p), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && !/^http:\/\/localhost/.test(process.env.APP_URL || ''),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
