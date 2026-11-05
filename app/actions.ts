'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import * as accounts from '@/lib/accounts';
import { now } from '@/lib/clock';
import { CATEGORIES, SHEETS, TASK_STATUSES, type Status } from '@/lib/config';
import { formatWib } from '@/lib/dates';
import { loadDb } from '@/lib/db';
import { env } from '@/lib/env';
import { findPerson, findPersonByPhone, normalizePhone } from '@/lib/master';
import { logAdmin, profileOf, setPhone, type WorkProfile } from '@/lib/people';
import * as sample from '@/lib/sample';
import * as svc from '@/lib/service';
import { clearSessionCookie, getSession, requireSuperadmin, requireUser, setSessionCookie } from '@/lib/session';
import { getStore } from '@/lib/store';
import { isDryRun, sendWa } from '@/lib/wa';

export interface FormState {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
}

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

function safeBack(fd: FormData, fallback: string): string {
  const b = s(fd, 'back');
  return b.startsWith('/') && !b.startsWith('//') ? b : fallback;
}

function done(path: string, r: svc.ActionResult): never {
  revalidatePath('/', 'layout');
  const [base, hash] = path.split('#');
  const sep = base.includes('?') ? '&' : '?';
  redirect(`${base}${sep}${r.ok ? 'ok' : 'err'}=${encodeURIComponent(r.message)}${hash ? `#${hash}` : ''}`);
}

async function parseRequestForm(fd: FormData): Promise<svc.RequestInput> {
  const kategori = fd.getAll('kategori').map(String).filter((k) => CATEGORIES.some((c) => c.name === k));
  const subJenis: Record<string, string[]> = {};
  const details: Record<string, Record<string, string>> = {};
  for (const k of kategori) {
    const def = CATEGORIES.find((c) => c.name === k)!;
    subJenis[k] = fd
      .getAll(`sub:${k}`)
      .map(String)
      .filter((x) => def.subTypes.includes(x));
    details[k] = Object.fromEntries(def.fields.map((f) => [f.key, s(fd, `detail:${k}:${f.key}`)]));
  }
  return {
    brand: s(fd, 'brand'),
    picName: s(fd, 'picName'),
    campaignName: s(fd, 'campaignName'),
    campaignType: s(fd, 'campaignType'),
    objective: s(fd, 'objective'),
    kategori,
    subJenis,
    details,
    usp: s(fd, 'usp'),
    keyMessage: s(fd, 'keyMessage'),
    creativeNote: s(fd, 'creativeNote'),
    targetAudience: s(fd, 'targetAudience'),
    budget: s(fd, 'budget').replace(/[^\d]/g, ''),
    dueDate: s(fd, 'dueDate'),
    deliverables: s(fd, 'deliverables'),
    supportingLink: s(fd, 'supportingLink'),
    attachments: s(fd, 'attachments'),
  };
}

export async function submitRequestAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const r = await svc.submitRequest(await getStore(), user, await parseRequestForm(fd));
  if (!r.ok) return { ok: false, message: r.message, errors: r.errors };
  done(`/requests/${r.id}`, { ok: true, message: `${r.message} Notifikasi WA terkirim ke PIC dan Traffic.` });
}

export async function updateBriefAction(requestId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const r = await svc.updateBrief(await getStore(), user, requestId, await parseRequestForm(fd));
  if (!r.ok) return { ok: false, message: r.message, errors: r.errors };
  done(`/requests/${requestId}`, r);
}

export async function cekBriefAction(fd: FormData) {
  const user = await requireUser();
  const requestId = s(fd, 'requestId');
  const decision = s(fd, 'decision') === 'Kurang' ? 'Kurang' : 'Lengkap';
  const r = await svc.cekBrief(await getStore(), user, { requestId, decision, note: s(fd, 'note'), deadline: s(fd, 'deadline') });
  done(safeBack(fd, `/requests/${requestId}`), r);
}

export async function assignAction(fd: FormData) {
  const user = await requireUser();
  const taskId = s(fd, 'taskId');
  const r = await svc.assignTask(await getStore(), user, taskId, s(fd, 'assignee'));
  done(safeBack(fd, `/tasks/${taskId}`), r);
}

export async function draftAction(fd: FormData) {
  const user = await requireUser();
  const taskId = s(fd, 'taskId');
  const r = await svc.submitDraft(await getStore(), user, taskId, s(fd, 'link'));
  done(safeBack(fd, `/tasks/${taskId}`), r);
}

export async function qcAction(fd: FormData) {
  const user = await requireUser();
  const taskId = s(fd, 'taskId');
  const r = await svc.qcDecision(await getStore(), user, taskId, s(fd, 'decision') === 'pass', s(fd, 'note'));
  done(safeBack(fd, `/tasks/${taskId}`), r);
}

export async function reviewAction(fd: FormData) {
  const user = await requireUser();
  const taskId = s(fd, 'taskId');
  const action = s(fd, 'decision') === 'ACC' ? 'ACC' : 'REV';
  const r = await svc.brandReview(await getStore(), user, taskId, action, s(fd, 'note'), 'web');
  done(safeBack(fd, `/tasks/${taskId}`), r);
}

export async function finalAction(fd: FormData) {
  const user = await requireUser();
  const taskId = s(fd, 'taskId');
  const r = await svc.submitFinal(await getStore(), user, taskId, s(fd, 'link'));
  done(safeBack(fd, `/tasks/${taskId}`), r);
}

export async function closeAction(fd: FormData) {
  const user = await requireUser();
  const taskId = s(fd, 'taskId');
  const r = await svc.closeTask(await getStore(), user, taskId);
  done(safeBack(fd, `/tasks/${taskId}`), r);
}

export async function priorityAction(fd: FormData) {
  const user = await requireUser();
  const taskId = s(fd, 'taskId');
  const r = await svc.updatePriority(await getStore(), user, taskId, {
    deadline: s(fd, 'deadline'),
    urgent: s(fd, 'urgent') === 'Ya',
  });
  done(safeBack(fd, `/tasks/${taskId}`), r);
}

export async function overrideAction(fd: FormData) {
  const user = await requireUser();
  const taskId = s(fd, 'taskId');
  const to = s(fd, 'status') as Status;
  if (!TASK_STATUSES.includes(to)) done(`/tasks/${taskId}`, { ok: false, message: 'Status tidak valid.' });
  const r = await svc.overrideStatus(await getStore(), user, taskId, to, s(fd, 'note'));
  done(safeBack(fd, `/tasks/${taskId}`), r);
}

// ---------------------------------------------------------------------------
// Login, akun, dan kelola user
// ---------------------------------------------------------------------------

function safeNext(v: string): string {
  return v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/login') ? v : '/';
}

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await accounts.authenticate(await getStore(), s(fd, 'email'), String(fd.get('password') ?? ''));
  if (!r.ok || !r.session) return { ok: false, message: r.message };
  try {
    await setSessionCookie(r.session);
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  redirect(r.session.m ? '/akun?wajib=1' : safeNext(s(fd, 'next')));
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect('/login');
}

export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const session = await getSession();
  const next = String(fd.get('password') ?? '');
  if (next !== String(fd.get('confirm') ?? '')) return { ok: false, message: 'Konfirmasi password tidak sama.' };
  const r = await accounts.changeOwnPassword(
    await getStore(),
    user.email,
    String(fd.get('current') ?? ''),
    next,
    session?.v === accounts.ENV_VERSION,
  );
  if (!r.ok || !r.session) return { ok: false, message: r.message };
  await setSessionCookie(r.session);
  redirect('/?ok=' + encodeURIComponent(r.message));
}

async function actor(): Promise<accounts.Actor> {
  const u = await requireSuperadmin();
  return { email: u.email, name: u.name, isSuperadmin: true };
}

function parseProfile(fd: FormData): WorkProfile {
  return {
    nama: s(fd, 'nama'),
    peran: s(fd, 'peran') as WorkProfile['peran'],
    sisi: s(fd, 'sisi') || 'Semua',
    divisi: s(fd, 'divisi'),
    jabatan: s(fd, 'jabatan'),
    brands: fd.getAll('brand').map(String).map((x) => x.trim()).filter(Boolean),
    phone: s(fd, 'phone'),
    kapasitas: s(fd, 'kapasitas'),
  };
}

export interface AdminState {
  ok?: boolean;
  message?: string;
  /** Link undangan untuk disalin admin bila email belum terkirim. */
  links?: { email: string; nama: string; link: string; detail: string }[];
}

export async function createUserAction(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const r = await accounts.createAccount(await getStore(), await actor(), {
    email: s(fd, 'email'),
    akses: s(fd, 'akses'),
    profile: parseProfile(fd),
    password: String(fd.get('password') ?? ''),
    mustChange: s(fd, 'mustChange') === 'Ya',
  });
  revalidatePath('/admin/users');
  return {
    ok: r.ok,
    message: r.message,
    links: r.invite ? [{ email: s(fd, 'email').toLowerCase(), nama: s(fd, 'nama'), link: r.invite.link, detail: r.invite.mail.detail }] : undefined,
  };
}

/** Buat akun cepat untuk orang yang sudah ada di master data (peran diambil dari master). */
export async function quickCreateAction(fd: FormData) {
  const store = await getStore();
  const db = await loadDb(store, { fresh: true });
  const person = findPerson(db.master, s(fd, 'nama'));
  const r = await accounts.createAccount(store, await actor(), {
    email: s(fd, 'email'),
    akses: 'User',
    profile: { ...profileOf(person, s(fd, 'nama')), phone: s(fd, 'phone') || person?.phone || '' },
    password: '',
    mustChange: false,
  });
  done('/admin/users', r);
}

export async function editProfileAction(fd: FormData) {
  const r = await accounts.editProfile(await getStore(), await actor(), s(fd, 'email'), parseProfile(fd));
  done(safeBack(fd, '/admin/users'), r);
}

export async function changeEmailAction(fd: FormData) {
  const r = await accounts.changeEmail(await getStore(), await actor(), s(fd, 'email'), s(fd, 'newEmail'));
  done(safeBack(fd, '/admin/users'), r);
}

export async function resendInviteAction(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const a = await actor();
  const email = s(fd, 'email');
  const r = await accounts.sendInvite(await getStore(), email, a.name);
  revalidatePath('/admin/users');
  const sent = r.mail.detail.startsWith('Terkirim');
  return {
    ok: sent,
    message: sent ? `Undangan terkirim ke ${email}.` : `Email belum terkirim (${r.mail.detail}). Salin link di bawah:`,
    links: [{ email, nama: s(fd, 'nama'), link: r.link, detail: r.mail.detail }],
  };
}

export async function blastInvitesAction(_prev: AdminState): Promise<AdminState> {
  const r = await accounts.blastInvites(await getStore(), await actor());
  revalidatePath('/admin/users');
  const unsent = r.results.filter((x) => !x.detail.startsWith('Terkirim'));
  return { ok: r.ok && !unsent.length, message: r.message, links: unsent.length ? unsent : undefined };
}

/** Halaman undangan: buat password lalu langsung masuk. */
export async function acceptInviteAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const password = String(fd.get('password') ?? '');
  if (password !== String(fd.get('confirm') ?? '')) return { ok: false, message: 'Konfirmasi password tidak sama.' };
  const r = await accounts.acceptInvite(await getStore(), s(fd, 'token'), password);
  if (!r.ok || !r.session) return { ok: false, message: r.message };
  await setSessionCookie(r.session);
  redirect('/?ok=' + encodeURIComponent(r.message));
}

export async function resetPasswordAction(fd: FormData) {
  const r = await accounts.resetPassword(await getStore(), await actor(), s(fd, 'email'), String(fd.get('password') ?? ''));
  done(safeBack(fd, '/admin/users'), r);
}

export async function updateUserAction(fd: FormData) {
  const aktif = s(fd, 'aktif');
  const r = await accounts.updateAccount(await getStore(), await actor(), s(fd, 'email'), {
    aktif: aktif ? aktif === 'Ya' : undefined,
    akses: s(fd, 'akses') || undefined,
    nama: s(fd, 'nama') || undefined,
  });
  done(safeBack(fd, '/admin/users'), r);
}

export async function generateSampleAction() {
  await requireSuperadmin();
  let r: svc.ActionResult;
  try {
    const c = await sample.generateSample(await getStore());
    r = {
      ok: true,
      message: `Data contoh dibuat: ${c.requests} request, ${c.tasks} task, ${c.statusLog} riwayat status, ${c.waLog} log WA, ${c.members} anggota contoh.`,
    };
  } catch (e) {
    r = { ok: false, message: (e as Error).message };
  }
  done('/admin/users#data-contoh', r);
}

export async function purgeSampleAction() {
  await requireSuperadmin();
  const c = await sample.purgeSample(await getStore());
  done('/admin/users#data-contoh', {
    ok: true,
    message: `Data contoh dihapus: ${c.requests} request, ${c.tasks} task, ${c.statusLog} riwayat status, ${c.waLog} log WA, ${c.members} anggota contoh.`,
  });
}

/** Superadmin: kirim pesan uji ke satu nomor untuk memastikan gateway WA tersambung. */
export async function testWaAction(fd: FormData) {
  const u = await requireSuperadmin();
  const back = safeBack(fd, '/admin/whatsapp#tes');
  const to = normalizePhone(s(fd, 'to'));
  if (!to) done(back, { ok: false, message: 'Nomor WA tujuan kosong.' });
  const text = s(fd, 'text') || `Tes dari Creative Request Tracker oleh ${u.name}. Bila pesan ini masuk, notifikasi WA sudah aktif.`;
  const store = await getStore();
  const db = await loadDb(store);
  const r = await sendWa(to, text, { dryRun: isDryRun(db.master.config.waDryRun) });
  const nama = findPersonByPhone(db.master, to)?.name || s(fd, 'nama');
  await store.append(SHEETS.WA_LOG, [
    { Timestamp: formatWib(now()), Arah: 'OUT', Nomor: to, Nama: nama, Jenis: 'Tes WA', 'Ref ID': '', Pesan: text, Hasil: r.detail },
  ]);
  done(back, {
    ok: r.ok && r.detail !== 'DRY_RUN',
    message: r.ok
      ? r.detail === 'DRY_RUN'
        ? `Mode uji (DRY_RUN) aktif: pesan ke ${nama || to} hanya dicatat di Log_WA, tidak dikirim. Matikan mode uji di Pengaturan WA untuk mengirim sungguhan.`
        : `Terkirim ke ${nama || to} (${to}).`
      : `Gagal kirim ke ${nama || to}: ${r.detail}`,
  });
}

/** Superadmin: nyalakan/matikan mode uji WA (disimpan di tab Config, mengalahkan env WA_DRY_RUN). */
export async function setWaModeAction(fd: FormData) {
  const u = await requireSuperadmin();
  const mode = s(fd, 'mode'); // Ya | Tidak | '' (ikuti env)
  if (!['Ya', 'Tidak', ''].includes(mode)) done('/admin/whatsapp', { ok: false, message: 'Mode tidak dikenal.' });
  const store = await getStore();
  const t = await store.readAll([SHEETS.CONFIG], { fresh: true });
  const before = String(t[SHEETS.CONFIG].find((r) => r.Key === 'WA_DRY_RUN')?.Value ?? '');
  if (t[SHEETS.CONFIG].some((r) => r.Key === 'WA_DRY_RUN')) {
    await store.update(SHEETS.CONFIG, 'Key', [{ key: 'WA_DRY_RUN', patch: { Value: mode } }]);
  } else {
    await store.append(SHEETS.CONFIG, [{ Key: 'WA_DRY_RUN', Value: mode, Keterangan: 'Ya = mode uji, Tidak = kirim sungguhan, kosong = ikuti env' }]);
  }
  await logAdmin(store, { by: u.name, aksi: 'Ubah mode WA', target: 'WA_DRY_RUN', dari: before || '(env)', ke: mode || '(env)' });
  done('/admin/whatsapp', {
    ok: true,
    message:
      mode === 'Tidak'
        ? 'Mode uji dimatikan: notifikasi WA sekarang dikirim sungguhan.'
        : mode === 'Ya'
          ? 'Mode uji dinyalakan: pesan WA hanya dicatat di Log_WA.'
          : 'Mode WA mengikuti variabel WA_DRY_RUN di Vercel.',
  });
}

/** Setiap user: ubah nomor WA miliknya sendiri (halaman Akun). */
export async function updateMyPhoneAction(fd: FormData) {
  const u = await requireUser();
  const raw = s(fd, 'phone');
  const phone = normalizePhone(raw);
  if (raw && phone.length < 9) done('/akun#wa', { ok: false, message: 'Nomor WA tidak valid. Contoh: 0812 3456 7890.' });
  const store = await getStore();
  const r = await setPhone(store, u.email, u.name, phone);
  if (r.ok) await logAdmin(store, { by: u.name, aksi: 'Ubah No WA (sendiri)', target: u.email, dari: r.from, ke: phone });
  done('/akun#wa', r);
}

/** Mode demo: masuk langsung sebagai persona (akun demo sudah dibuat saat seeding). */
export async function demoLoginAction(fd: FormData) {
  if (!env.demoMode) redirect('/login');
  const email = s(fd, 'email').toLowerCase();
  const db = await loadDb(await getStore(), { fresh: true });
  const acc = db.accounts.find((a) => a.email === email);
  if (!acc) redirect('/login');
  await setSessionCookie({ e: email, v: accounts.passwordVersion(acc.hash), m: 0 });
  redirect(safeNext(s(fd, 'next')));
}
