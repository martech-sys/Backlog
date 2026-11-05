import { STATUS, type RequestRow, type TaskRow } from './config';
import type { Db } from './db';

export interface RevisiRow {
  task: TaskRow;
  request: RequestRow | undefined;
  ronde: number;
  /** "Brand" (revisi dari PIC) atau "QC lead" (revisi internal). */
  sumber: 'Brand' | 'QC lead';
  /** Nama orang yang meminta revisi terakhir. */
  dari: string;
  /** Waktu revisi masuk (WIB "YYYY-MM-DD HH:mm:ss"). */
  masuk: string;
}

export const REVISI_STATUSES: string[] = [STATUS.REVISI_BRAND, STATUS.REVISI_INTERNAL];

/** Task yang sedang direvisi (dari brand atau QC lead), terbaru di atas. */
export function revisionRows(db: Pick<Db, 'tasks' | 'requests' | 'statusLog'>): RevisiRow[] {
  const reqById = new Map(db.requests.map((r) => [r['Request ID'], r]));
  return db.tasks
    .filter((t) => REVISI_STATUSES.includes(t.Status))
    .map((t) => {
      const log = db.statusLog
        .filter((l) => l.ID === t['Task ID'] && l.Ke === t.Status && l.Dari !== l.Ke)
        .sort((a, b) => b.Timestamp.localeCompare(a.Timestamp))[0];
      const brand = t.Status === STATUS.REVISI_BRAND;
      return {
        task: t,
        request: reqById.get(t['Request ID']),
        ronde: Number(t['Ronde Revisi']) || 0,
        sumber: brand ? ('Brand' as const) : ('QC lead' as const),
        dari: log?.Oleh || (brand ? t['PIC Brand'] : t.Lead),
        masuk: log?.Timestamp || t['Status Sejak'],
      };
    })
    .sort((a, b) => b.masuk.localeCompare(a.masuk));
}
