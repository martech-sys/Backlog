import {
  SHEETS,
  type BrandRow,
  type ConfigRow,
  type GrupRow,
  type KategoriRow,
  type LiburRow,
  type PicRow,
  type RequestRow,
  type StatusLogRow,
  type TaskRow,
  type TimRow,
  type WaLogRow,
} from './config';
import { buildMaster, type Master } from './master';
import type { Store } from './store';

export interface Db {
  master: Master;
  requests: RequestRow[];
  tasks: TaskRow[];
  statusLog: StatusLogRow[];
  waLog: WaLogRow[];
}

const ALL = [
  SHEETS.CONFIG,
  SHEETS.GRUP,
  SHEETS.BRAND,
  SHEETS.PIC,
  SHEETS.TIM,
  SHEETS.KATEGORI,
  SHEETS.LIBUR,
  SHEETS.REQUEST,
  SHEETS.TASK,
  SHEETS.STATUS_LOG,
  SHEETS.WA_LOG,
];

/** `fresh: true` untuk aksi yang menulis (lewati cache baca). */
export async function loadDb(store: Store, opts: { withWaLog?: boolean; fresh?: boolean } = {}): Promise<Db> {
  const names = opts.withWaLog ? ALL : ALL.filter((n) => n !== SHEETS.WA_LOG);
  const t = await store.readAll(names, { fresh: opts.fresh });
  const master = buildMaster({
    config: t[SHEETS.CONFIG] as unknown as ConfigRow[],
    grup: t[SHEETS.GRUP] as unknown as GrupRow[],
    brand: t[SHEETS.BRAND] as unknown as BrandRow[],
    pic: t[SHEETS.PIC] as unknown as PicRow[],
    tim: t[SHEETS.TIM] as unknown as TimRow[],
    kategori: t[SHEETS.KATEGORI] as unknown as KategoriRow[],
    libur: t[SHEETS.LIBUR] as unknown as LiburRow[],
  });
  return {
    master,
    requests: (t[SHEETS.REQUEST] as unknown as RequestRow[]).filter((r) => r['Request ID']),
    tasks: (t[SHEETS.TASK] as unknown as TaskRow[]).filter((r) => r['Task ID']),
    statusLog: t[SHEETS.STATUS_LOG] as unknown as StatusLogRow[],
    waLog: (t[SHEETS.WA_LOG] || []) as unknown as WaLogRow[],
  };
}

export function findRequest(db: Db, id: string): RequestRow | undefined {
  return db.requests.find((r) => r['Request ID'] === id);
}

export function findTask(db: Db, id: string): TaskRow | undefined {
  return db.tasks.find((t) => t['Task ID'] === id);
}

export function tasksOf(db: Db, requestId: string): TaskRow[] {
  return db.tasks.filter((t) => t['Request ID'] === requestId);
}
