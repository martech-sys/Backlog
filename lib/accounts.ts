/**
 * Akun login email + password, dikelola Superadmin di halaman Kelola User.
 * Password di-hash dengan scrypt (bawaan Node, tanpa dependensi) dan disimpan di tab Users.
 */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { parseAkses, type Account } from './account-model';
import { AKSES, SHEETS, type UserRow } from './config';
import { now } from './clock';
import { formatWib } from './dates';
import { loadDb } from './db';
import { env } from './env';
import { findPerson, normalizeEmail } from './master';
import type { Store } from './store';
import type { SessionPayload } from './token';

export { parseAccounts, parseAkses, type Account } from './account-model';

export interface Result {
  ok: boolean;
  message: string;
}

export const MIN_PASSWORD = 8;

// ---------------------------------------------------------------------------
// Hash password
// ---------------------------------------------------------------------------

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** Format: scrypt$N$r$p$salt$hash (base64). */
export async function hashPassword(password: string, cost = 16384): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, { N: cost, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${cost}$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Versi password untuk token sesi: berubah setiap hash berubah. */
export function passwordVersion(hash: string): string {
  return hash ? createHash('sha256').update(hash).digest('base64url').slice(0, 12) : 'none';
}

export function validateNewPassword(pw: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Password minimal ${MIN_PASSWORD} karakter.`;
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password harus berisi huruf dan angka.';
  return null;
}

// ---------------------------------------------------------------------------
// Superadmin cadangan dari environment (untuk login pertama / darurat)
// ---------------------------------------------------------------------------

export function envSuperadmin(): { email: string; password: string } | null {
  const email = normalizeEmail(env.superadminEmail);
  return email && env.superadminPassword ? { email, password: env.superadminPassword } : null;
}

export const ENV_VERSION = 'env';

// ---------------------------------------------------------------------------
// Pembatasan percobaan login (per instance server)
// ---------------------------------------------------------------------------

const attempts = new Map<string, { fails: number; until: number }>();
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

function lockedFor(key: string): number {
  const a = attempts.get(key);
  if (!a || a.until < Date.now()) return 0;
  return Math.ceil((a.until - Date.now()) / 60000);
}

function recordFail(key: string) {
  const a = attempts.get(key) || { fails: 0, until: 0 };
  a.fails += 1;
  if (a.fails >= MAX_FAILS) {
    a.until = Date.now() + LOCK_MS;
    a.fails = 0;
  }
  attempts.set(key, a);
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function authenticate(
  store: Store,
  emailRaw: string,
  password: string,
): Promise<Result & { session?: Omit<SessionPayload, 'x'> }> {
  const email = normalizeEmail(emailRaw);
  const generic = 'Email atau password salah.';
  if (!email || !password) return { ok: false, message: 'Isi email dan password.' };
  const mins = lockedFor(email);
  if (mins) return { ok: false, message: `Terlalu banyak percobaan gagal. Coba lagi dalam ${mins} menit.` };

  const db = await loadDb(store, { fresh: true });
  const acc = db.accounts.find((a) => a.email === email);

  if (acc && !acc.aktif) return { ok: false, message: 'Akun ini dinonaktifkan. Hubungi Superadmin.' };

  if (acc?.hash && (await verifyPassword(password, acc.hash))) {
    attempts.delete(email);
    await store.update(SHEETS.USERS, 'Email', [{ key: rowKey(db.accountRows, email), patch: { 'Login Terakhir': formatWib(now()) } }]);
    return { ok: true, message: 'OK', session: { e: email, v: passwordVersion(acc.hash), m: acc.mustChange ? 1 : 0 } };
  }

  // Superadmin dari env: berlaku bila email cocok dan (belum ada akun atau akunnya Superadmin aktif).
  const boot = envSuperadmin();
  if (boot && boot.email === email && password === boot.password && (!acc || acc.akses === AKSES.SUPERADMIN)) {
    attempts.delete(email);
    if (acc) await store.update(SHEETS.USERS, 'Email', [{ key: rowKey(db.accountRows, email), patch: { 'Login Terakhir': formatWib(now()) } }]);
    // Belum punya password sendiri → minta buat password pribadi.
    return { ok: true, message: 'OK', session: { e: email, v: ENV_VERSION, m: acc && !acc.hash ? 1 : 0 } };
  }

  recordFail(email);
  return { ok: false, message: generic };
}

/** Nilai asli kolom Email di sheet (bisa beda huruf besar/kecil) untuk dipakai sebagai kunci update. */
function rowKey(rows: UserRow[], email: string): string {
  return rows.find((r) => normalizeEmail(r.Email) === email)?.Email || email;
}

// ---------------------------------------------------------------------------
// Kelola user (Superadmin)
// ---------------------------------------------------------------------------

export interface Actor {
  email: string;
  name: string;
  isSuperadmin: boolean;
}

const deny: Result = { ok: false, message: 'Hanya Superadmin yang bisa mengelola user.' };
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export async function createAccount(
  store: Store,
  actor: Actor,
  p: { email: string; nama: string; akses: string; password: string; mustChange: boolean },
): Promise<Result> {
  if (!actor.isSuperadmin) return deny;
  const email = normalizeEmail(p.email);
  const nama = p.nama.trim();
  if (!isEmail(email)) return { ok: false, message: 'Format email tidak valid.' };
  if (!nama) return { ok: false, message: 'Nama wajib diisi.' };
  const bad = validateNewPassword(p.password);
  if (bad) return { ok: false, message: bad };
  const db = await loadDb(store, { fresh: true });
  if (db.accounts.some((a) => a.email === email)) return { ok: false, message: `Email ${email} sudah terdaftar.` };
  await store.append(SHEETS.USERS, [
    {
      Email: email,
      Nama: nama,
      Akses: parseAkses(p.akses),
      'Password Hash': await hashPassword(p.password),
      Aktif: 'Ya',
      'Wajib Ganti Password': p.mustChange ? 'Ya' : 'Tidak',
      Dibuat: formatWib(now()),
      'Dibuat Oleh': actor.name,
      'Login Terakhir': '',
    },
  ]);
  const linked = findPerson(db.master, nama);
  return {
    ok: true,
    message: `Akun ${email} dibuat${linked ? ` dan terhubung ke ${linked.name} (${linked.peran})` : ' (nama tidak ada di master data: akses lihat saja)'}. Bagikan password-nya ke user.`,
  };
}

export async function resetPassword(store: Store, actor: Actor, emailRaw: string, password: string): Promise<Result> {
  if (!actor.isSuperadmin) return deny;
  const email = normalizeEmail(emailRaw);
  const bad = validateNewPassword(password);
  if (bad) return { ok: false, message: bad };
  const db = await loadDb(store, { fresh: true });
  if (!db.accounts.some((a) => a.email === email)) return { ok: false, message: 'Akun tidak ditemukan.' };
  await store.update(SHEETS.USERS, 'Email', [
    { key: rowKey(db.accountRows, email), patch: { 'Password Hash': await hashPassword(password), 'Wajib Ganti Password': 'Ya' } },
  ]);
  return { ok: true, message: `Password ${email} di-reset. User wajib menggantinya saat login berikutnya.` };
}

function activeSuperadmins(accounts: Account[]): Account[] {
  return accounts.filter((a) => a.aktif && a.akses === AKSES.SUPERADMIN);
}

export async function updateAccount(
  store: Store,
  actor: Actor,
  emailRaw: string,
  p: { aktif?: boolean; akses?: string; nama?: string },
): Promise<Result> {
  if (!actor.isSuperadmin) return deny;
  const email = normalizeEmail(emailRaw);
  const db = await loadDb(store, { fresh: true });
  const acc = db.accounts.find((a) => a.email === email);
  if (!acc) return { ok: false, message: 'Akun tidak ditemukan.' };

  const next = { ...acc };
  if (p.aktif !== undefined) next.aktif = p.aktif;
  if (p.akses !== undefined) next.akses = parseAkses(p.akses);
  if (p.nama !== undefined && p.nama.trim()) next.nama = p.nama.trim();

  if (email === actor.email && (!next.aktif || next.akses !== AKSES.SUPERADMIN)) {
    return { ok: false, message: 'Kamu tidak bisa menonaktifkan atau menurunkan akses akunmu sendiri.' };
  }
  const remaining = activeSuperadmins(db.accounts.map((a) => (a.email === email ? next : a)));
  if (!remaining.length) return { ok: false, message: 'Harus ada minimal satu Superadmin aktif.' };

  await store.update(SHEETS.USERS, 'Email', [
    { key: rowKey(db.accountRows, email), patch: { Aktif: next.aktif ? 'Ya' : 'Tidak', Akses: next.akses, Nama: next.nama } },
  ]);
  return { ok: true, message: `Akun ${email} diperbarui.` };
}

export async function changeOwnPassword(
  store: Store,
  emailRaw: string,
  current: string,
  password: string,
  usingEnvSession: boolean,
): Promise<Result & { session?: Omit<SessionPayload, 'x'> }> {
  const email = normalizeEmail(emailRaw);
  const bad = validateNewPassword(password);
  if (bad) return { ok: false, message: bad };
  if (password === current) return { ok: false, message: 'Password baru harus berbeda dari password lama.' };
  const db = await loadDb(store, { fresh: true });
  const acc = db.accounts.find((a) => a.email === email);
  if (!acc) return { ok: false, message: 'Akun belum terdaftar di tab Users. Minta Superadmin menambahkannya.' };

  const boot = envSuperadmin();
  const currentOk =
    (acc.hash && (await verifyPassword(current, acc.hash))) ||
    (usingEnvSession && boot && boot.email === email && current === boot.password);
  if (!currentOk) return { ok: false, message: 'Password saat ini salah.' };

  const hash = await hashPassword(password);
  await store.update(SHEETS.USERS, 'Email', [
    { key: rowKey(db.accountRows, email), patch: { 'Password Hash': hash, 'Wajib Ganti Password': 'Tidak' } },
  ]);
  return { ok: true, message: 'Password berhasil diganti.', session: { e: email, v: passwordVersion(hash), m: 0 } };
}

/** Password acak yang mudah dibacakan: 3 huruf + 4 angka + 3 huruf, tanpa karakter mirip. */
export function generatePassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (set: string, n: number) =>
    Array.from(randomBytes(n), (b) => set[b % set.length]).join('');
  return `${pick(letters, 3)}${pick(digits, 4)}${pick(letters, 3)}`;
}
