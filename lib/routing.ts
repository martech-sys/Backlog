import { ACTIVE_STATUSES, type TaskRow } from './config';
import { addWorkingDays, workingDaysBetween } from './dates';
import type { KategoriRule, Master, Person } from './master';
import { brandOf, findPerson, grupOf } from './master';

export interface RouteResult {
  grup: string;
  traffic: string;
  creativeHead: string;
  rules: KategoriRule[];
  leadTimeMin: number;
}

/** Langkah 1 routing: brand → grup → Traffic & Creative Head; kategori → aturan divisi. */
export function routeRequest(master: Master, brand: string, kategoriList: string[]): RouteResult {
  const b = brandOf(master, brand);
  const grupName = b?.grup || '';
  const g = grupOf(master, grupName);
  const wanted = kategoriList.map((k) => k.toLowerCase());
  const rules = master.kategori.filter((r) => wanted.includes(r.kategori.toLowerCase()));
  return {
    grup: grupName,
    traffic: g?.traffic || '',
    creativeHead: g?.creativeHead || '',
    rules,
    leadTimeMin: rules.reduce((max, r) => Math.max(max, r.leadTimeMin), 0),
  };
}

/** URGENT bila sisa hari kerja sampai due date kurang dari lead time minimum. */
export function isUrgent(today: string, due: string, leadTimeMin: number, holidays: Set<string>): boolean {
  if (!due) return false;
  return workingDaysBetween(today, due, holidays) < leadTimeMin;
}

/** Hitung task aktif per anggota (dipakai untuk auto-assign dan grafik beban). */
export function activeLoad(tasks: Pick<TaskRow, 'Assignee' | 'Status'>[]): Map<string, number> {
  const load = new Map<string, number>();
  for (const t of tasks) {
    const a = String(t.Assignee || '').trim();
    if (!a || !ACTIVE_STATUSES.includes(t.Status as never)) continue;
    load.set(a, (load.get(a) || 0) + 1);
  }
  return load;
}

/**
 * Pilih anggota divisi dengan task aktif paling sedikit (rasio terhadap kapasitas,
 * lalu jumlah absolut, lalu nama). Lead tidak ikut dipilih bila ada anggota lain.
 */
export function pickLeastLoaded(
  master: Master,
  divisi: string,
  grup: string,
  load: Map<string, number>,
): Person | undefined {
  const inDivisi = master.people.filter(
    (p) =>
      p.active &&
      p.divisi.toLowerCase() === divisi.toLowerCase() &&
      (p.grup === 'Semua' || !p.grup || p.grup.toLowerCase() === grup.toLowerCase()),
  );
  const members = inDivisi.filter((p) => !p.isLead);
  const pool = members.length ? members : inDivisi;
  if (!pool.length) return undefined;
  return [...pool].sort((a, b) => {
    const la = load.get(a.name) || 0;
    const lb = load.get(b.name) || 0;
    const ra = la / Math.max(a.capacity || 1, 1);
    const rb = lb / Math.max(b.capacity || 1, 1);
    if (ra !== rb) return ra - rb;
    if (la !== lb) return la - lb;
    return a.name.localeCompare(b.name);
  })[0];
}

export interface TaskDraft {
  kategori: string;
  divisi: string;
  lead: string;
  assignee: string;
  deadline: string;
  targetDraft: string;
}

/**
 * Langkah 2 routing: pecah request menjadi task per divisi, tentukan lead,
 * assignee (bila otomatis), deadline, dan target draft.
 */
export function buildTaskDrafts(params: {
  master: Master;
  grup: string;
  kategoriList: string[];
  deadline: string;
  today: string;
  existingTasks: Pick<TaskRow, 'Assignee' | 'Status'>[];
}): TaskDraft[] {
  const { master, grup, kategoriList, deadline, today } = params;
  const load = activeLoad(params.existingTasks);
  const wanted = kategoriList.map((k) => k.toLowerCase());
  const drafts: TaskDraft[] = [];

  for (const rule of master.kategori.filter((r) => wanted.includes(r.kategori.toLowerCase()))) {
    const isWomens = grup.toLowerCase().startsWith('women');
    const lead = (isWomens ? rule.leadWomenswear : rule.leadMenswear) || rule.leadMenswear || rule.leadWomenswear;

    let assignee = '';
    if (rule.modeAssign === 'Default' && rule.assigneeDefault) {
      assignee = rule.assigneeDefault;
    } else if (rule.modeAssign === 'Otomatis beban') {
      assignee = pickLeastLoaded(master, rule.divisi, grup, load)?.name || '';
    }
    if (assignee && !findPerson(master, assignee)) assignee = '';
    if (assignee) load.set(assignee, (load.get(assignee) || 0) + 1);

    let targetDraft = addWorkingDays(deadline, -rule.bufferReview, master.holidays);
    if (targetDraft < today) targetDraft = today;

    drafts.push({ kategori: rule.kategori, divisi: rule.divisi, lead, assignee, deadline, targetDraft });
  }
  return drafts;
}

/** ID tiket berikutnya: PREFIX-YYMM-NNN (urut per bulan). */
export function nextTicketId(prefix: string, today: string, existingIds: string[]): string {
  const yymm = today.slice(2, 4) + today.slice(5, 7);
  const base = `${prefix}-${yymm}-`;
  let max = 0;
  for (const id of existingIds) {
    if (!id.startsWith(base)) continue;
    const n = parseInt(id.slice(base.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${base}${String(max + 1).padStart(3, '0')}`;
}
