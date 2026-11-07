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
import { emailLayout, escapeHtml, sendMail, type MailResult } from './mail';
import { findPerson, findPersonByEmail, normalizeEmail } from './master';
import { deactivatePerson, describe, logAdmin, profileOf, renameEmailInMaster, saveProfile, validateProfile, type WorkProfile } from './people';
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
  const boot0 = envSuperadmin();
  if (acc && !acc.hash && !(boot0 && boot0.email === email)) {
    return { ok: false, message: 'Akun ini belum aktif. Buka email undangan untuk membuat password, atau minta Superadmin mengirim ulang undangan.' };
  }

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

export interface CreateInput {
  email: string;
  akses: string;
  profile: WorkProfile;
  /** Opsional: password awal (cadangan bila email undangan tidak sampai). */
  password: string;
  mustChange: boolean;
}

export interface InviteOutcome {
  /** Link atur password (tampilkan ke admin bila email tidak terkirim). */
  link: string;
  mail: MailResult;
}

export async function createAccount(
  store: Store,
  actor: Actor,
  p: CreateInput,
): Promise<Result & { invite?: InviteOutcome }> {
  if (!actor.isSuperadmin) return deny;
  const email = normalizeEmail(p.email);
  const akses = parseAkses(p.akses);
  if (!isEmail(email)) return { ok: false, message: 'Format email tidak valid.' };
  const db = await loadDb(store, { fresh: true });
  const bad = validateProfile(p.profile, akses !== AKSES.USER, db.master.brands.map((b) => b.name));
  if (bad) return { ok: false, message: bad };
  if (p.password) {
    const weak = validateNewPassword(p.password);
    if (weak) return { ok: false, message: weak };
  }
  if (db.accounts.some((a) => a.email === email)) return { ok: false, message: `Email ${email} sudah terdaftar.` };
  const nama = p.profile.nama.trim();

  await store.append(SHEETS.USERS, [
    {
      Email: email,
      Nama: nama,
      Akses: akses,
      'Password Hash': p.password ? await hashPassword(p.password) : '',
      Aktif: 'Ya',
      'Wajib Ganti Password': p.password && p.mustChange ? 'Ya' : 'Tidak',
      Dibuat: formatWib(now()),
      'Dibuat Oleh': actor.name,
      'Login Terakhir': '',
    },
  ]);
  const saved = await saveProfile(store, { email, profile: p.profile, by: actor.name });
  await logAdmin(store, { by: actor.name, aksi: 'Tambah user', target: email, dari: '', ke: `${akses} · ${saved.to}` });

  const invite = await sendInvite(store, email, actor.name);
  const sent = invite.mail.ok && !invite.mail.detail.startsWith('DRY_RUN');
  return {
    ok: true,
    message: `Akun ${email} dibuat (${saved.to}). ${
      sent ? 'Email undangan terkirim.' : `Email undangan belum terkirim (${invite.mail.detail}); salin link undangan di bawah dan kirim ke user.`
    }`,
    invite,
  };
}

/** Ubah data kerja user (peran, sisi, divisi, brand, No WA, nama, jabatan, kapasitas). */
export async function editProfile(store: Store, actor: Actor, emailRaw: string, profile: WorkProfile): Promise<Result> {
  if (!actor.isSuperadmin) return deny;
  const email = normalizeEmail(emailRaw);
  const db = await loadDb(store, { fresh: true });
  const acc = db.accounts.find((a) => a.email === email);
  if (!acc) return { ok: false, message: 'Akun tidak ditemukan.' };
  const bad = validateProfile(profile, acc.akses !== AKSES.USER, db.master.brands.map((b) => b.name));
  if (bad) return { ok: false, message: bad };
  const saved = await saveProfile(store, { email, oldName: acc.nama, profile, by: actor.name });
  if (profile.nama.trim() && profile.nama.trim() !== acc.nama) {
    await store.update(SHEETS.USERS, 'Email', [{ key: rowKey(db.accountRows, email), patch: { Nama: profile.nama.trim() } }]);
  }
  if (saved.from !== saved.to) await logAdmin(store, { by: actor.name, aksi: 'Ubah peran kerja', target: email, dari: saved.from, ke: saved.to });
  return { ok: true, message: `Data kerja ${profile.nama.trim() || email} disimpan: ${saved.to}.` };
}

/** Superadmin mengganti email login user. Riwayat request/task tetap (tertaut lewat nama). */
export async function changeEmail(store: Store, actor: Actor, oldRaw: string, newRaw: string): Promise<Result> {
  if (!actor.isSuperadmin) return deny;
  const oldEmail = normalizeEmail(oldRaw);
  const newEmail = normalizeEmail(newRaw);
  if (!isEmail(newEmail)) return { ok: false, message: 'Format email baru tidak valid.' };
  if (oldEmail === newEmail) return { ok: false, message: 'Email baru sama dengan email lama.' };
  const db = await loadDb(store, { fresh: true });
  const acc = db.accounts.find((a) => a.email === oldEmail);
  if (!acc) return { ok: false, message: 'Akun tidak ditemukan.' };
  if (db.accounts.some((a) => a.email === newEmail)) return { ok: false, message: `Email ${newEmail} sudah terdaftar di akun lain.` };

  await store.update(SHEETS.USERS, 'Email', [{ key: rowKey(db.accountRows, oldEmail), patch: { Email: newEmail } }]);
  await renameEmailInMaster(store, oldEmail, newEmail);
  // Riwayat tetap melekat: request yang diajukan dengan email lama ikut memakai email baru.
  const reqs = db.requests.filter((r) => normalizeEmail(r['Email Requestor']) === oldEmail);
  if (reqs.length)
    await store.update(SHEETS.REQUEST, 'Request ID', reqs.map((r) => ({ key: r['Request ID'], patch: { 'Email Requestor': newEmail } })));
  await logAdmin(store, { by: actor.name, aksi: 'Ganti email', target: acc.nama, dari: oldEmail, ke: newEmail });

  const body = (who: string) =>
    emailLayout('Email akun kamu telah diubah', [
      `Halo ${escapeHtml(acc.nama)},`,
      `Email login Creative Request Tracker milikmu diubah oleh ${escapeHtml(actor.name)} dari <b>${escapeHtml(oldEmail)}</b> menjadi <b>${escapeHtml(newEmail)}</b>.`,
      who === 'new'
        ? 'Mulai sekarang, login memakai email ini dengan password yang sama.'
        : 'Email ini tidak bisa dipakai login lagi. Bila kamu tidak merasa meminta perubahan ini, hubungi Superadmin.',
    ], { label: 'Buka Creative Tracker', href: `${env.appUrl}/login` });
  const text = `Email login Creative Request Tracker diubah dari ${oldEmail} menjadi ${newEmail} oleh ${actor.name}.`;
  await sendMail(store, { to: oldEmail, nama: acc.nama, jenis: 'Ganti email (lama)', subject: 'Email akun Creative Tracker diubah', html: body('old'), text });
  await sendMail(store, { to: newEmail, nama: acc.nama, jenis: 'Ganti email (baru)', subject: 'Email akun Creative Tracker diubah', html: body('new'), text });
  return { ok: true, message: `Email ${acc.nama} diganti ke ${newEmail}. Login berikutnya memakai email baru.` };
}

// ---------------------------------------------------------------------------
// Undangan: link atur password sekali pakai, berlaku 72 jam
// ---------------------------------------------------------------------------

export const INVITE_HOURS = 72;
const tokenHash = (t: string) => createHash('sha256').update(t).digest('hex');

/** Buat token undangan baru (token lama otomatis tidak berlaku) dan kirim email. */
export async function sendInvite(store: Store, emailRaw: string, by: string): Promise<InviteOutcome> {
  const email = normalizeEmail(emailRaw);
  const db = await loadDb(store, { fresh: true });
  const acc = db.accounts.find((a) => a.email === email);
  const token = randomBytes(24).toString('base64url');
  const expires = new Date(now().getTime() + INVITE_HOURS * 3600e3);
  await store.update(SHEETS.USERS, 'Email', [
    {
      key: rowKey(db.accountRows, email),
      patch: { 'Token Undangan': tokenHash(token), 'Token Kedaluwarsa': expires.toISOString(), 'Undangan Terkirim': formatWib(now()) },
    },
  ]);
  const link = `${env.appUrl}/undangan?token=${token}`;
  const nama = acc?.nama || email;
  const person = findPersonByEmail(db.master, email) || findPerson(db.master, nama);
  const peran = person ? describe(profileOf(person)) : acc?.akses || 'User';
  const mail = await sendMail(store, {
    to: email,
    nama,
    jenis: 'Undangan akun',
    subject: 'Undangan Creative Request Tracker: atur password akunmu',
    html: emailLayout(
      'Akun Creative Tracker kamu sudah siap',
      [
        `Halo ${escapeHtml(nama)},`,
        `${escapeHtml(by)} membuatkan akun Creative Request Tracker untukmu dengan peran <b>${escapeHtml(peran)}</b>.`,
        `Login memakai email <b>${escapeHtml(email)}</b>. Klik tombol di bawah untuk membuat password sendiri.`,
      ],
      { label: 'Atur password', href: link },
      `Link ini hanya bisa dipakai sekali dan berlaku ${INVITE_HOURS} jam. Bila sudah kedaluwarsa, minta Superadmin mengirim ulang undangan. Halaman login: ${escapeHtml(env.appUrl)}/login`,
    ),
    text: `Halo ${nama},\n\nAkun Creative Request Tracker kamu sudah dibuat (peran: ${peran}). Login dengan email ${email}.\nBuat password di: ${link}\n(berlaku ${INVITE_HOURS} jam, sekali pakai)`,
  });
  return { link, mail };
}

/** Kirim undangan ke semua akun aktif yang belum pernah login. */
export async function blastInvites(store: Store, actor: Actor): Promise<Result & { results: { email: string; nama: string; link: string; detail: string }[] }> {
  if (!actor.isSuperadmin) return { ...deny, results: [] };
  const db = await loadDb(store, { fresh: true });
  const targets = db.accounts.filter((a) => a.aktif && !a.lastLogin && a.email !== actor.email);
  const results: { email: string; nama: string; link: string; detail: string }[] = [];
  for (const a of targets) {
    const r = await sendInvite(store, a.email, actor.name);
    results.push({ email: a.email, nama: a.nama, link: r.link, detail: r.mail.detail });
  }
  const sent = results.filter((r) => r.detail.startsWith('Terkirim')).length;
  if (targets.length) await logAdmin(store, { by: actor.name, aksi: 'Kirim undangan massal', target: `${targets.length} akun`, dari: '', ke: `${sent} terkirim` });
  return {
    ok: true,
    message: targets.length ? `Undangan dibuat untuk ${targets.length} akun yang belum pernah login (${sent} email terkirim).` : 'Semua akun aktif sudah pernah login.',
    results,
  };
}

export type InviteCheck = { ok: true; email: string; nama: string } | { ok: false; message: string };

export async function checkInvite(store: Store, token: string): Promise<InviteCheck> {
  if (!token) return { ok: false, message: 'Link undangan tidak lengkap.' };
  const db = await loadDb(store, { fresh: true });
  const acc = db.accounts.find((a) => a.inviteHash && a.inviteHash === tokenHash(token));
  if (!acc) return { ok: false, message: 'Link undangan tidak berlaku atau sudah dipakai. Minta Superadmin mengirim undangan baru.' };
  if (!acc.aktif) return { ok: false, message: 'Akun ini dinonaktifkan. Hubungi Superadmin.' };
  if (!acc.inviteExpires || Date.parse(acc.inviteExpires) < now().getTime()) {
    return { ok: false, message: `Link undangan sudah lewat ${INVITE_HOURS} jam. Minta Superadmin mengirim undangan baru.` };
  }
  return { ok: true, email: acc.email, nama: acc.nama };
}

/** Pakai undangan: simpan password baru, hapus token (sekali pakai), lalu kembalikan sesi login. */
export async function acceptInvite(store: Store, token: string, password: string): Promise<Result & { session?: Omit<SessionPayload, 'x'> }> {
  const check = await checkInvite(store, token);
  if (!check.ok) return { ok: false, message: check.message };
  const weak = validateNewPassword(password);
  if (weak) return { ok: false, message: weak };
  const db = await loadDb(store, { fresh: true });
  const hash = await hashPassword(password);
  await store.update(SHEETS.USERS, 'Email', [
    {
      key: rowKey(db.accountRows, check.email),
      patch: {
        'Password Hash': hash,
        'Wajib Ganti Password': 'Tidak',
        'Token Undangan': '',
        'Token Kedaluwarsa': '',
        'Login Terakhir': formatWib(now()),
      },
    },
  ]);
  return { ok: true, message: 'Password dibuat. Selamat datang!', session: { e: check.email, v: passwordVersion(hash), m: 0 } };
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

/** Superadmin dari env masih bisa login bila emailnya tidak punya akun, atau akunnya Superadmin aktif. */
function envSuperadminUsable(accounts: Account[]): boolean {
  const boot = envSuperadmin();
  if (!boot) return false;
  const own = accounts.find((a) => a.email === boot.email);
  return !own || (own.aktif && own.akses === AKSES.SUPERADMIN);
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
  // Hanya relevan bila yang diubah adalah Superadmin aktif; Superadmin dari env juga dihitung.
  const wasActiveSuper = acc.aktif && acc.akses === AKSES.SUPERADMIN;
  const after = db.accounts.map((a) => (a.email === email ? next : a));
  if (wasActiveSuper && !activeSuperadmins(after).length && !envSuperadminUsable(after)) return { ok: false, message: 'Harus ada minimal satu Superadmin aktif.' };

  await store.update(SHEETS.USERS, 'Email', [
    { key: rowKey(db.accountRows, email), patch: { Aktif: next.aktif ? 'Ya' : 'Tidak', Akses: next.akses, Nama: next.nama } },
  ]);
  return { ok: true, message: `Akun ${email} diperbarui.` };
}

/**
 * Hapus akun login secara permanen. Riwayat request/task/komentar tetap (memakai nama).
 * Bila `deactivate`, orangnya juga dinonaktifkan di Master_Tim/Master_PIC agar tidak menerima tugas & WA lagi.
 */
export async function deleteAccount(store: Store, actor: Actor, emailRaw: string, opts: { deactivate: boolean }): Promise<Result> {
  if (!actor.isSuperadmin) return deny;
  const email = normalizeEmail(emailRaw);
  if (email === normalizeEmail(actor.email)) return { ok: false, message: 'Kamu tidak bisa menghapus akunmu sendiri.' };
  const db = await loadDb(store, { fresh: true });
  const acc = db.accounts.find((a) => a.email === email);
  if (!acc) return { ok: false, message: 'Akun tidak ditemukan.' };
  const isActiveSuper = acc.aktif && acc.akses === AKSES.SUPERADMIN;
  const after = db.accounts.filter((a) => a.email !== email);
  if (isActiveSuper && !activeSuperadmins(after).length && !envSuperadminUsable(after))
    return { ok: false, message: 'Harus ada minimal satu Superadmin aktif.' };

  const removed = await store.deleteWhere(SHEETS.USERS, 'Email', (v) => normalizeEmail(v) === email);
  if (!removed) return { ok: false, message: 'Akun tidak ditemukan.' };
  const off = opts.deactivate ? await deactivatePerson(store, email, acc.nama) : 0;
  await logAdmin(store, {
    by: actor.name,
    aksi: 'Hapus user',
    target: email,
    dari: `${acc.nama} · ${acc.akses}`,
    ke: off ? 'dihapus; dinonaktifkan dari tim/PIC' : 'dihapus',
  });
  return {
    ok: true,
    message: `Akun ${acc.nama} (${email}) dihapus.${off ? ' Juga dinonaktifkan dari tim/PIC, jadi tidak menerima tugas & WA lagi.' : ''}`,
  };
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
