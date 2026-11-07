import { DONE_STATUSES, type Status, type TaskRow } from './config';
import type { Db } from './db';
import type { CurrentUser } from './workflow';

/** Nama orang yang memegang bola, dari kolom "Bola di" (mis. "Lead (Adit)" → "Adit"). */
export function holderName(bola: string): string {
  const b = String(bola || '').trim();
  const m = b.match(/\(([^)]+)\)\s*$/);
  if (m) return m[1].trim();
  return b === '-' || /^belum di-assign$/i.test(b) || /^(Traffic|PIC Brand|Lead)$/.test(b) ? '' : b;
}

/** Bola task ada di user ini (dibandingkan nama persis, bukan potongan nama). */
export function ballIsMine(u: Pick<CurrentUser, 'name'>, t: TaskRow, traffic: string): boolean {
  if (DONE_STATUSES.includes(t.Status as Status)) return false;
  const holder = holderName(t['Bola di']);
  if (holder) return holder === u.name;
  return String(t['Bola di']).startsWith('Traffic') && traffic === u.name;
}

/** Task aktif yang bolanya di user ini: dipakai badge menu & filter "Tugas saya". */
export function myTasks(db: Pick<Db, 'tasks' | 'requests'>, u: Pick<CurrentUser, 'name'>): TaskRow[] {
  const traffic = new Map(db.requests.map((r) => [r['Request ID'], r.Traffic]));
  return db.tasks.filter((t) => ballIsMine(u, t, traffic.get(t['Request ID']) || ''));
}

/** Kunci "sudah dibuka": berubah setiap kali status berpindah, jadi tugas yang kembali ke user tampil Baru lagi. */
export const seenKey = (t: Pick<TaskRow, 'Task ID' | 'Status Sejak'>) => `${t['Task ID']}@${t['Status Sejak']}`;

/** Tingkat urgensi untuk warna baris: late = overdue/URGENT, soon = deadline hari ini/besok. */
export function urgency(t: TaskRow, today: string, tomorrow: string): 'late' | 'soon' | '' {
  if (DONE_STATUSES.includes(t.Status as Status)) return '';
  const d = String(t.Deadline || '').slice(0, 10);
  if ((d && d < today) || t.Urgent === 'Ya') return 'late';
  if (d && d <= tomorrow) return 'soon';
  return '';
}
