import { STATUS, type TaskRow } from './config';

/** Urutan tahap utama progress journey (mengikuti status yang ada). */
export const JOURNEY: string[] = [
  STATUS.SIAP_ASSIGN,
  STATUS.DIKERJAKAN,
  STATUS.QC_LEAD,
  STATUS.REVIEW_BRAND,
  STATUS.ACC,
  STATUS.FINAL,
  STATUS.SELESAI,
];

/** Status cabang dipetakan ke tahap utama tempat task "kembali" dikerjakan. */
const BRANCH: Record<string, { stage: string; label: string }> = {
  [STATUS.REVISI_INTERNAL]: { stage: STATUS.DIKERJAKAN, label: 'Revisi internal' },
  [STATUS.REVISI_BRAND]: { stage: STATUS.DIKERJAKAN, label: 'Revisi brand' },
};

export interface JourneyPos {
  /** Indeks tahap utama saat ini (0..JOURNEY.length-1). */
  index: number;
  stage: string;
  /** Penanda tambahan (bukan tahap utama): revisi, overdue. */
  flags: string[];
}

export function journeyOf(t: Pick<TaskRow, 'Status' | 'Deadline' | 'Ronde Revisi'>, today: string): JourneyPos {
  const branch = BRANCH[t.Status];
  const stage = branch ? branch.stage : t.Status;
  const index = Math.max(0, JOURNEY.indexOf(stage));
  const flags: string[] = [];
  if (branch) flags.push(branch.label + (t.Status === STATUS.REVISI_BRAND && Number(t['Ronde Revisi']) ? ` R${Number(t['Ronde Revisi'])}` : ''));
  const done = t.Status === STATUS.FINAL || t.Status === STATUS.SELESAI;
  if (!done && t.Deadline && String(t.Deadline).slice(0, 10) < today) flags.push('Overdue');
  return { index, stage, flags };
}

/** Jumlah task per tahap utama (status cabang dihitung terpisah sebagai penanda). */
export function journeyCounts(tasks: Pick<TaskRow, 'Status' | 'Deadline' | 'Ronde Revisi'>[], today: string) {
  const stages = JOURNEY.map((s) => ({ status: s, count: tasks.filter((t) => t.Status === s).length }));
  const revisi = tasks.filter((t) => BRANCH[t.Status]).length;
  const overdue = tasks.filter((t) => journeyOf(t, today).flags.includes('Overdue')).length;
  return { stages, revisi, overdue };
}
