import {
  BALL_OWNER,
  DONE_STATUSES,
  STATUS,
  TRANSITIONS,
  type RequestRow,
  type Status,
  type TaskRow,
} from './config';
import type { Role } from './master';

export function canTransition(from: string, to: string): boolean {
  return (TRANSITIONS[from] || []).includes(to as Status);
}

/** Nama orang yang sedang memegang bola untuk sebuah task. */
export function ballHolder(
  status: string,
  task: Pick<TaskRow, 'Lead' | 'Assignee' | 'PIC Brand'>,
  traffic: string,
): string {
  switch (BALL_OWNER[status]) {
    case 'Traffic':
      return traffic ? `Traffic (${traffic})` : 'Traffic';
    case 'PIC Brand':
      return task['PIC Brand'] ? `PIC Brand (${task['PIC Brand']})` : 'PIC Brand';
    case 'Lead':
      return task.Lead ? `Lead (${task.Lead})` : 'Lead';
    case 'Assignee':
      return task.Assignee ? task.Assignee : 'Belum di-assign';
    default:
      return '-';
  }
}

export function isDone(status: string): boolean {
  return DONE_STATUSES.includes(status as Status);
}

// ---------------------------------------------------------------------------
// Balasan WA: "ACC CR-2610-001-1" atau "REV CR-2610-001-1 warna kurang terang"
// ---------------------------------------------------------------------------

export interface WaReply {
  action: 'ACC' | 'REV';
  id: string;
  note: string;
}

export function parseWaReply(text: string): WaReply | null {
  const m = /^\s*\*?(ACC|REV|REVISI)\*?\s+([A-Za-z]+-\d{4}-\d{3,}(?:-\d+)?)\s*[:\-–]?\s*([\s\S]*)$/i.exec(text || '');
  if (!m) return null;
  const action = m[1].toUpperCase() === 'ACC' ? 'ACC' : 'REV';
  return { action, id: m[2].toUpperCase(), note: m[3].trim() };
}

/** True bila id adalah Task ID (punya akhiran -N), bukan Request ID. */
export function isTaskId(id: string): boolean {
  return /^[A-Z]+-\d{4}-\d{3,}-\d+$/i.test(id);
}

// ---------------------------------------------------------------------------
// Hak akses
// ---------------------------------------------------------------------------

export interface CurrentUser {
  email: string;
  name: string;
  roles: Role[];
  grup: string;
}

const has = (u: CurrentUser, ...roles: Role[]) => roles.some((r) => u.roles.includes(r));
const sameGrup = (u: CurrentUser, grup: string) =>
  !u.grup || u.grup === 'Semua' || u.grup.toLowerCase() === String(grup || '').toLowerCase();

export const can = {
  submitRequest: (u: CurrentUser) => has(u, 'admin', 'hocp', 'head', 'traffic', 'pic'),

  cekBrief: (u: CurrentUser, r: Pick<RequestRow, 'Grup'>) =>
    has(u, 'admin', 'hocp') || (has(u, 'traffic', 'head') && sameGrup(u, r.Grup)),

  editBrief: (u: CurrentUser, r: Pick<RequestRow, 'Grup' | 'PIC Brand' | 'Email Requestor'>) =>
    can.cekBrief(u, r) ||
    (has(u, 'pic') && (u.name === r['PIC Brand'] || u.email === String(r['Email Requestor'] || '').toLowerCase())),

  assign: (u: CurrentUser, t: Pick<TaskRow, 'Lead' | 'Grup'>) =>
    has(u, 'admin', 'hocp') || (has(u, 'head') && sameGrup(u, t.Grup)) || (has(u, 'lead') && u.name === t.Lead),

  work: (u: CurrentUser, t: Pick<TaskRow, 'Lead' | 'Assignee' | 'Grup'>) =>
    has(u, 'admin') || u.name === t.Assignee || u.name === t.Lead,

  qc: (u: CurrentUser, t: Pick<TaskRow, 'Lead' | 'Grup'>) =>
    has(u, 'admin', 'hocp') || (has(u, 'head') && sameGrup(u, t.Grup)) || u.name === t.Lead,

  review: (u: CurrentUser, t: Pick<TaskRow, 'PIC Brand' | 'Grup'>) =>
    has(u, 'admin') || u.name === t['PIC Brand'] || (has(u, 'traffic') && sameGrup(u, t.Grup)),

  close: (u: CurrentUser, t: Pick<TaskRow, 'Grup'>) =>
    has(u, 'admin', 'hocp') || (has(u, 'traffic', 'head') && sameGrup(u, t.Grup)),

  prioritize: (u: CurrentUser, t: Pick<TaskRow, 'Grup'>) =>
    has(u, 'admin', 'hocp') || (has(u, 'traffic', 'head') && sameGrup(u, t.Grup)),

  override: (u: CurrentUser) => has(u, 'admin'),
};

/** Aksi yang relevan untuk user pada task di status saat ini (dipakai UI). */
export function availableActions(u: CurrentUser, t: TaskRow): string[] {
  const s = t.Status;
  const out: string[] = [];
  if (!isDone(s) && can.assign(u, t)) out.push('assign');
  if ((s === STATUS.DIKERJAKAN || s === STATUS.REVISI_INTERNAL || s === STATUS.REVISI_BRAND) && can.work(u, t))
    out.push('draft');
  if (s === STATUS.QC_LEAD && can.qc(u, t)) out.push('qc');
  if (s === STATUS.REVIEW_BRAND && can.review(u, t)) out.push('review');
  if (s === STATUS.ACC && can.work(u, t)) out.push('final');
  if (s === STATUS.FINAL && can.close(u, t)) out.push('close');
  if (!isDone(s) && can.prioritize(u, t)) out.push('priority');
  if (can.override(u)) out.push('override');
  return out;
}
