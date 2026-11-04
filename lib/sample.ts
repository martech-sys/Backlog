/**
 * Data contoh: request/task berawalan "DEMO-" dan anggota tim bertanda "(contoh)".
 * Dipakai untuk melihat alur & insight sebelum data asli masuk, dan bisa dihapus
 * sekali klik oleh Superadmin.
 */
import { HEADERS, SHEETS, type SheetName } from './config';
import { runSimulation } from './clock';
import { MemoryStore } from './store/memory';
import type { Cell, Store } from './store';

export const SAMPLE_PREFIX = 'DEMO';
export const SAMPLE_MARK = '(contoh)';

const isSampleId = (v: string) => v.startsWith(`${SAMPLE_PREFIX}-`);
const isSampleName = (v: string) => v.endsWith(SAMPLE_MARK);

/** Anggota tim contoh (Master_Tim) agar beban kerja & auto-assign terlihat. */
export const SAMPLE_MEMBERS: (string | number)[][] = [
  ['Desainer 1 (contoh)', 'Graphic Designer', 'Desain', 'Semua', 'Tidak', 'Tidak', 4, '', '', 'Ya'],
  ['Desainer 2 (contoh)', 'Graphic Designer', 'Desain', 'Semua', 'Tidak', 'Tidak', 4, '', '', 'Ya'],
  ['Desainer 3 (contoh)', 'Graphic Designer', 'Desain', 'Semua', 'Tidak', 'Tidak', 4, '', '', 'Ya'],
  ['Intern Desain (contoh)', 'Intern Desain', 'Desain', 'Semua', 'Tidak', 'Ya', 2, '', '', 'Ya'],
  ['Fotografer 1 (contoh)', 'Photographer', 'Foto', 'Menswear', 'Tidak', 'Tidak', 3, '', '', 'Ya'],
  ['Fotografer 2 (contoh)', 'Photographer', 'Foto', 'Womenswear', 'Tidak', 'Tidak', 3, '', '', 'Ya'],
  ['Videografer 1 (contoh)', 'Videographer', 'Video', 'Semua', 'Tidak', 'Tidak', 3, '', '', 'Ya'],
  ['Assistant Studio (contoh)', 'Assistant Studio', 'Styling', 'Semua', 'Tidak', 'Tidak', 3, '', '', 'Ya'],
];

export interface SampleCounts {
  requests: number;
  tasks: number;
  statusLog: number;
  waLog: number;
  members: number;
}

export async function countSample(store: Store): Promise<SampleCounts> {
  const t = await store.readAll([SHEETS.REQUEST, SHEETS.TASK, SHEETS.STATUS_LOG, SHEETS.WA_LOG, SHEETS.TIM]);
  return {
    requests: t[SHEETS.REQUEST].filter((r) => isSampleId(r['Request ID'] || '')).length,
    tasks: t[SHEETS.TASK].filter((r) => isSampleId(r['Task ID'] || '')).length,
    statusLog: t[SHEETS.STATUS_LOG].filter((r) => isSampleId(r.ID || '')).length,
    waLog: t[SHEETS.WA_LOG].filter((r) => isSampleId(r['Ref ID'] || '') || isSampleName(r.Nama || '')).length,
    members: t[SHEETS.TIM].filter((r) => isSampleName(r.Nama || '')).length,
  };
}

/** Hapus semua data contoh. Data asli (ID selain DEMO-) tidak tersentuh. */
export async function purgeSample(store: Store): Promise<SampleCounts> {
  // Urutan: data turunan dulu, master terakhir.
  const waLog =
    (await store.deleteWhere(SHEETS.WA_LOG, 'Ref ID', isSampleId)) + (await store.deleteWhere(SHEETS.WA_LOG, 'Nama', isSampleName));
  const statusLog = await store.deleteWhere(SHEETS.STATUS_LOG, 'ID', isSampleId);
  const tasks = await store.deleteWhere(SHEETS.TASK, 'Task ID', isSampleId);
  const requests = await store.deleteWhere(SHEETS.REQUEST, 'Request ID', isSampleId);
  const members = await store.deleteWhere(SHEETS.TIM, 'Nama', isSampleName);
  return { requests, tasks, statusLog, waLog, members };
}

const MASTER_SHEETS: SheetName[] = [SHEETS.CONFIG, SHEETS.GRUP, SHEETS.BRAND, SHEETS.PIC, SHEETS.TIM, SHEETS.KATEGORI, SHEETS.LIBUR];
const DATA_SHEETS: SheetName[] = [SHEETS.REQUEST, SHEETS.TASK, SHEETS.STATUS_LOG, SHEETS.WA_LOG];

/**
 * Buat ±6 minggu aktivitas contoh memakai master data saat ini + anggota tim contoh,
 * dengan logika aplikasi yang asli (routing, status, revisi, notifikasi), lalu tulis ke store.
 * Simulasi berjalan di memori dengan jam sendiri; WA tidak dikirim.
 */
export async function generateSample(store: Store): Promise<SampleCounts> {
  const existing = await countSample(store);
  if (existing.requests || existing.tasks || existing.members) {
    throw new Error('Data contoh sudah ada. Hapus dulu sebelum membuat ulang.');
  }

  const master = await store.readAll(MASTER_SHEETS, { fresh: true });
  const toRows = (name: SheetName) => master[name].map((r) => HEADERS[name].map((h) => r[h] ?? ''));
  const seed: Record<string, Cell[][]> = {};
  for (const name of MASTER_SHEETS) seed[name] = toRows(name);
  seed[SHEETS.CONFIG] = [
    ...seed[SHEETS.CONFIG].filter((r) => r[0] !== 'TICKET_PREFIX'),
    ['TICKET_PREFIX', SAMPLE_PREFIX, ''],
  ];
  seed[SHEETS.TIM] = [...seed[SHEETS.TIM], ...SAMPLE_MEMBERS];

  const mem = new MemoryStore(HEADERS, seed);
  const { seedDemoActivity } = await import('./demo');
  await runSimulation(() => seedDemoActivity(mem));

  const data = await mem.readAll(DATA_SHEETS);
  const asObjects = (name: SheetName) =>
    data[name].map((r) => Object.fromEntries(HEADERS[name].map((h) => [h, r[h] ?? ''])) as Record<string, Cell>);

  const timHeaders = HEADERS[SHEETS.TIM];
  await store.append(
    SHEETS.TIM,
    SAMPLE_MEMBERS.map((r) => Object.fromEntries(timHeaders.map((h, i) => [h, r[i] ?? '']))),
  );
  for (const name of DATA_SHEETS) await store.append(name, asObjects(name));

  return {
    requests: data[SHEETS.REQUEST].length,
    tasks: data[SHEETS.TASK].length,
    statusLog: data[SHEETS.STATUS_LOG].length,
    waLog: data[SHEETS.WA_LOG].length,
    members: SAMPLE_MEMBERS.length,
  };
}
