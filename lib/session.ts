import 'server-only';
import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { authOptions } from './auth';
import { loadDb, type Db } from './db';
import { env } from './env';
import { getStore } from './store';
import { resolveUser } from './users';
import type { CurrentUser } from './workflow';

export const DEMO_COOKIE = 'demo_email';

/** Data terbaru untuk satu render halaman (di-cache per request). */
export const getDb = cache(async (): Promise<Db> => loadDb(await getStore()));

/** Sama dengan getDb, ditambah Log_WA (untuk halaman detail). */
export const getDbWithWa = cache(async (): Promise<Db> => loadDb(await getStore(), { withWaLog: true }));

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  let email = '';
  let name = '';
  if (env.demoMode) {
    email = (await cookies()).get(DEMO_COOKIE)?.value || '';
  } else {
    const session = await getServerSession(authOptions);
    email = session?.user?.email || '';
    name = session?.user?.name || '';
  }
  if (!email) return null;
  const db = await getDb();
  return resolveUser(db.master, email, name);
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect('/login');
  return u;
}
