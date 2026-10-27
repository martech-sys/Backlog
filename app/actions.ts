'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { CATEGORIES, TASK_STATUSES, type Status } from '@/lib/config';
import { env } from '@/lib/env';
import * as svc from '@/lib/service';
import { DEMO_COOKIE, requireUser } from '@/lib/session';
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
// Login demo (hanya aktif bila DEMO_MODE=true)
// ---------------------------------------------------------------------------

export async function demoLoginAction(fd: FormData) {
  if (!env.demoMode) redirect('/login');
  const email = s(fd, 'email').toLowerCase();
  (await cookies()).set(DEMO_COOKIE, email, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 });
  const next = s(fd, 'next');
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}

export async function demoLogoutAction() {
  (await cookies()).delete(DEMO_COOKIE);
  redirect('/login');
}
