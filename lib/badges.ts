/**
 * Badge merah di sidebar (poin 15): jumlah hal baru sejak user terakhir membuka menu Request, Tracker,
 * dan Dashboard. Status "sudah dibuka" disimpan per user di tab Users (kolom "Terakhir Dilihat"),
 * jadi berlaku di semua perangkat dan tidak memengaruhi user lain.
 */
import { SHEETS, type RequestRow, type TaskRow, type UserRow } from './config';
import { addDays } from './dates';
import type { Db } from './db';
import type { Store } from './store';
import { can, type CurrentUser } from './workflow';

export const BADGE_MENUS = ['requests', 'tracker', 'dashboard'] as const;
export type BadgeMenu = (typeof BADGE_MENUS)[number];
export type SeenMap = Partial<Record<BadgeMenu, string>>;

/** Belum pernah dibuka: hitung aktivitas 3 hari terakhir saja agar badge tidak langsung ratusan. */
const DEFAULT_LOOKBACK_DAYS = 3;

const norm = (e: string) => String(e || '').trim().toLowerCase();

export function readSeen(rows: Pick<UserRow, 'Email' | 'Terakhir Dilihat'>[], email: string): SeenMap {
  const raw = rows.find((r) => norm(r.Email) === norm(email))?.['Terakhir Dilihat'];
  try {
    const v = JSON.parse(String(raw || '{}')) as unknown;
    if (!v || typeof v !== 'object') return {};
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).filter(([k, x]) => (BADGE_MENUS as readonly string[]).includes(k) && typeof x === 'string'),
    ) as SeenMap;
  } catch {
    return {};
  }
}

const involves = (u: CurrentUser, t: Pick<TaskRow, 'Assignee' | 'Lead' | 'PIC Brand'>) =>
  t.Assignee === u.name || t.Lead === u.name || t['PIC Brand'] === u.name;

/** Request yang relevan untuk user: yang boleh ia cek briefnya, atau miliknya sebagai PIC. */
const requestInScope = (u: CurrentUser, r: RequestRow) =>
  can.cekBrief(u, r) || r['PIC Brand'] === u.name || norm(r['Email Requestor']) === norm(u.email);

/** Task yang relevan: ia terlibat, atau ia memantau grup itu (Traffic/Creative Head/admin). */
const taskInScope = (u: CurrentUser, t: TaskRow) => involves(u, t) || can.prioritize(u, t);

export function computeBadges(
  db: Pick<Db, 'requests' | 'tasks'>,
  u: CurrentUser,
  seen: SeenMap,
  nowTs: string,
): Record<BadgeMenu, number> {
  const fallback = `${addDays(nowTs.slice(0, 10), -DEFAULT_LOOKBACK_DAYS)} 00:00`;
  const since = (m: BadgeMenu) => seen[m] || fallback;
  // Aktivitas yang dilakukan user sendiri tidak dihitung sebagai "baru".
  const requests = db.requests.filter(
    (r) => r.Timestamp > since('requests') && norm(r['Email Requestor']) !== norm(u.email) && requestInScope(u, r),
  ).length;
  const tracker = db.tasks.filter((t) => t.Dibuat > since('tracker') && taskInScope(u, t)).length;
  const dashboard = db.tasks.filter((t) => String(t['Status Sejak'] || '') > since('dashboard') && taskInScope(u, t)).length;
  return { requests, tracker, dashboard };
}

/** Catat bahwa user membuka menu ini sekarang. Akun tanpa baris di Users (superadmin env) dilewati. */
export async function markSeen(store: Store, rows: UserRow[], email: string, menu: BadgeMenu, nowTs: string): Promise<boolean> {
  const row = rows.find((r) => norm(r.Email) === norm(email));
  if (!row) return false;
  const next = { ...readSeen(rows, email), [menu]: nowTs };
  await store.update(SHEETS.USERS, 'Email', [{ key: row.Email, patch: { 'Terakhir Dilihat': JSON.stringify(next) } }]);
  return true;
}
