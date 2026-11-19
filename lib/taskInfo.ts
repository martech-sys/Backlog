/**
 * Informasi tampilan task yang dipakai Tracker, detail task, dan Dashboard:
 * judul (ala ClickUp), tanggal pengajuan, dan Creative Output Task Health.
 */
import { DONE_STATUSES, type RequestRow, type Status, type TaskRow } from './config';
import { diffDays } from './dates';

/** Judul utama task: Judul task → Judul request → Campaign Name → ID. */
export function taskTitle(t: Pick<TaskRow, 'Judul' | 'Task ID'>, r?: Pick<RequestRow, 'Judul' | 'Campaign Name'>): string {
  return String(t.Judul || r?.Judul || r?.['Campaign Name'] || t['Task ID']).trim();
}

/** Waktu request diajukan (Timestamp request), dipakai untuk urutan Tracker. Cadangan: waktu task dibuat. */
export function submittedAt(t: Pick<TaskRow, 'Dibuat'>, r?: Pick<RequestRow, 'Timestamp'>): string {
  return String(r?.Timestamp || t.Dibuat || '');
}

/**
 * Urutan Tracker: pengajuan terbaru di atas, request yang masuk lebih dulu turun ke bawah.
 * Dalam satu request, task diurutkan menurut ID agar stabil saat filter dipakai.
 */
export function bySubmittedDesc<T extends Pick<TaskRow, 'Task ID' | 'Dibuat' | 'Request ID'>>(
  reqById: Map<string, Pick<RequestRow, 'Timestamp'>>,
): (a: T, b: T) => number {
  return (a, b) =>
    submittedAt(b, reqById.get(b['Request ID'])).localeCompare(submittedAt(a, reqById.get(a['Request ID']))) ||
    b['Request ID'].localeCompare(a['Request ID']) ||
    a['Task ID'].localeCompare(b['Task ID'], undefined, { numeric: true });
}

// ---------------------------------------------------------------------------
// Creative Output Task Health (5 tingkat, dari sisa waktu terhadap deadline)
// ---------------------------------------------------------------------------

export type HealthKey = 'ontrack' | 'urgent' | 'veryurgent' | 'overdue' | 'critical';

export interface HealthLevel {
  key: HealthKey;
  /** Label badge, mis. "ON TRACK". */
  badge: string;
  /** Nilai singkat, mis. "Normal", "+2 Days". */
  value: string;
  /** Keterangan aturan. */
  rule: string;
}

export const HEALTH_LEVELS: HealthLevel[] = [
  { key: 'ontrack', badge: 'ON TRACK', value: 'Normal', rule: 'On schedule' },
  { key: 'urgent', badge: 'URGENT', value: 'Priority', rule: 'Less than 3 days left' },
  { key: 'veryurgent', badge: 'VERY URGENT', value: '+1 Day', rule: '1 day late' },
  { key: 'overdue', badge: 'OVERDUE', value: '+2 Days', rule: '2 days late' },
  { key: 'critical', badge: 'CRITICAL', value: '3+ Days', rule: '3+ days late — escalate' },
];

export const healthOf = (key: HealthKey): HealthLevel => HEALTH_LEVELS.find((h) => h.key === key)!;

/**
 * Tingkat kesehatan task aktif. Task Final/Selesai tidak punya label (null).
 * Sisa = deadline − hari ini (hari kalender): ≥ 3 → ON TRACK, 0–2 → URGENT, −1 → VERY URGENT, −2 → OVERDUE, ≤ −3 → CRITICAL.
 */
export function taskHealth(t: Pick<TaskRow, 'Status' | 'Deadline'>, today: string): HealthLevel | null {
  if (DONE_STATUSES.includes(t.Status as Status)) return null;
  const d = String(t.Deadline || '').slice(0, 10);
  if (!d) return healthOf('ontrack');
  const left = diffDays(today, d);
  if (left >= 3) return healthOf('ontrack');
  if (left >= 0) return healthOf('urgent');
  if (left === -1) return healthOf('veryurgent');
  if (left === -2) return healthOf('overdue');
  return healthOf('critical');
}
