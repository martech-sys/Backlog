'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { CATEGORIES, TASK_STATUSES, type Status } from '@/lib/config';
import * as accounts from '@/lib/accounts';
import { loadDb } from '@/lib/db';
import { env } from '@/lib/env';
import * as sample from '@/lib/sample';
import * as svc from '@/lib/service';
import { clearSessionCookie, getSession, requireSuperadmin, requireUser, setSessionCookie } from '@/lib/session';
import { getStore } from '@/lib/store';

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

export async function createUserAction(fd: FormData) {
  const r = await accounts.createAccount(await getStore(), await actor(), {
    email: s(fd, 'email'),
    nama: s(fd, 'nama'),
    akses: s(fd, 'akses'),
    password: String(fd.get('password') ?? ''),
    mustChange: s(fd, 'mustChange') === 'Ya',
  });
  done(safeBack(fd, '/admin/users'), r);
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
