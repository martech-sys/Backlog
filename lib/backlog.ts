/**
 * Papan "Team Backlog" (gaya template Mural): task tiap anggota dipetakan ke kolom
 * On Hold · To Do · Ongoing · Unplanned · Blocker · Done, dengan prioritas Low/Med/High.
 */
import { ACTIVE_STATUSES, STATUS, type Status, type StatusLogRow, type TaskRow } from './config';
import { addDays, diffDays } from './dates';
import type { Master, Person } from './master';

export type Lane = 'onHold' | 'todo' | 'ongoing' | 'unplanned' | 'blocker' | 'done';
export type Priority = 'low' | 'med' | 'high';

export const LANES: { key: Lane; label: string; hint: string }[] = [
  { key: 'onHold', label: 'On Hold', hint: 'Menunggu QC lead atau ACC brand' },
  { key: 'todo', label: 'To Do', hint: 'Belum ada draft' },
  { key: 'ongoing', label: 'Ongoing', hint: 'Revisi atau upload final' },
  { key: 'unplanned', label: 'Unplanned', hint: 'Request URGENT (di bawah lead time)' },
  { key: 'blocker', label: 'Blocker', hint: 'Lewat deadline' },
  { key: 'done', label: 'Done', hint: 'Final 7 hari terakhir' },
];

/** 10 warna papan seperti template Mural. */
export const BOARD_COLORS = [
  '#f29d00',
  '#e3262f',
  '#3a9a1e',
  '#1ea5d8',
  '#7b4a9e',
  '#e8195e',
  '#2a8fa3',
  '#a23fd8',
  '#f26b2e',
  '#43b02a',
];

export interface Sticky {
  taskId: string;
  requestId: string;
  brand: string;
  kategori: string;
  subJenis: string;
  status: string;
  deadline: string;
  daysLeft: number;
  priority: Priority;
  urgent: boolean;
  revisi: number;
}

export interface BoardCard {
  key: string;
  title: string;
  subtitle: string;
  initials: string;
  color: string;
  load: number;
  capacity: number;
  lanes: Record<Lane, Sticky[]>;
  stats: { active: number; doneMonth: number; onTimePct: number | null };
  updates: { ts: string; text: string }[];
}

export type GroupBy = 'anggota' | 'brand' | 'divisi';

export function priorityOf(daysLeft: number, urgent: boolean): Priority {
  if (urgent || daysLeft <= 1) return 'high';
  if (daysLeft <= 3) return 'med';
  return 'low';
}

export function laneOf(t: TaskRow, today: string): Lane | null {
  const s = t.Status as Status;
  const daysLeft = t.Deadline ? diffDays(today, t.Deadline.slice(0, 10)) : 99;
  if (s === STATUS.FINAL || s === STATUS.SELESAI) {
    const done = (t['Selesai Pada'] || '').slice(0, 10);
    return done && done >= addDays(today, -7) ? 'done' : null;
  }
  if (daysLeft < 0) return 'blocker';
  if (t.Urgent === 'Ya') return 'unplanned';
  if (s === STATUS.QC_LEAD || s === STATUS.REVIEW_BRAND) return 'onHold';
  if (s === STATUS.SIAP_ASSIGN || (s === STATUS.DIKERJAKAN && !(Number(t['Versi Draft']) > 0))) return 'todo';
  return 'ongoing';
}

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] || '')).toUpperCase();
}

function toSticky(t: TaskRow, today: string): Sticky {
  const daysLeft = t.Deadline ? diffDays(today, t.Deadline.slice(0, 10)) : 99;
  const urgent = t.Urgent === 'Ya';
  return {
    taskId: t['Task ID'],
    requestId: t['Request ID'],
    brand: t.Brand,
    kategori: t.Kategori,
    subJenis: t['Sub-jenis'],
    status: t.Status,
    deadline: t.Deadline,
    daysLeft,
    priority: priorityOf(daysLeft, urgent),
    urgent,
    revisi: Number(t['Ronde Revisi']) || 0,
  };
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, med: 1, low: 2 };

export function buildBoards(params: {
  master: Master;
  tasks: TaskRow[];
  statusLog: StatusLogRow[];
  today: string;
  groupBy: GroupBy;
  grup?: string;
  divisi?: string;
  q?: string;
}): BoardCard[] {
  const { master, today, groupBy } = params;
  const q = (params.q || '').toLowerCase();
  const tasks = params.tasks.filter(
    (t) =>
      (!params.grup || t.Grup === params.grup) &&
      (!params.divisi || t.Divisi === params.divisi) &&
      (!q || `${t['Task ID']} ${t.Brand} ${t.Kategori} ${t.Assignee}`.toLowerCase().includes(q)),
  );

  const keyOf = (t: TaskRow) =>
    groupBy === 'brand' ? t.Brand : groupBy === 'divisi' ? t.Divisi : t.Assignee || (t.Status === STATUS.SIAP_ASSIGN ? `Belum assign · ${t.Divisi}` : '');

  // Kelompok yang selalu tampil walau kosong: anggota creative aktif / semua brand / semua divisi
  const baseKeys: string[] =
    groupBy === 'brand'
      ? master.brands.filter((b) => b.active && (!params.grup || b.grup === params.grup)).map((b) => b.name)
      : groupBy === 'divisi'
        ? [...new Set(master.kategori.map((k) => k.divisi))].filter((d) => !params.divisi || d === params.divisi)
        : master.people
            .filter(
              (p) =>
                p.active &&
                !['management', 'traffic', 'brand'].includes(p.divisi.toLowerCase()) &&
                (!params.divisi || p.divisi === params.divisi) &&
                (!params.grup || p.grup === 'Semua' || p.grup === params.grup),
            )
            .map((p) => p.name);

  const groups = new Map<string, TaskRow[]>(baseKeys.map((k) => [k, []]));
  for (const t of tasks) {
    const k = keyOf(t);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }

  const taskIdsByKey = new Map<string, Set<string>>();
  for (const [k, ts] of groups) taskIdsByKey.set(k, new Set(ts.map((t) => t['Task ID'])));
  const monthStart = today.slice(0, 8) + '01';

  const cards: BoardCard[] = [];
  let i = 0;
  for (const [key, ts] of groups) {
    const lanes: Record<Lane, Sticky[]> = { onHold: [], todo: [], ongoing: [], unplanned: [], blocker: [], done: [] };
    for (const t of ts) {
      const lane = laneOf(t, today);
      if (lane) lanes[lane].push(toSticky(t, today));
    }
    for (const l of Object.values(lanes)) l.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.daysLeft - b.daysLeft);

    const person: Person | undefined = groupBy === 'anggota' ? master.people.find((p) => p.name === key) : undefined;
    const brand = groupBy === 'brand' ? master.brands.find((b) => b.name === key) : undefined;
    const active = ts.filter((t) => ACTIVE_STATUSES.includes(t.Status as Status)).length;
    const finishedMonth = ts.filter((t) => (t['Selesai Pada'] || '').slice(0, 10) >= monthStart);
    const onTime = finishedMonth.filter((t) => t['Selesai Pada'].slice(0, 10) <= t.Deadline.slice(0, 10)).length;

    const ids = taskIdsByKey.get(key)!;
    const updates = params.statusLog
      .filter((l) => ids.has(l.ID))
      .sort((a, b) => b.Timestamp.localeCompare(a.Timestamp))
      .slice(0, 3)
      .map((l) => ({
        ts: l.Timestamp,
        text: `${l.ID} · ${l.Dari && l.Dari !== l.Ke ? `${l.Dari} → ` : ''}${l.Ke}`,
      }));

    cards.push({
      key,
      title: key,
      subtitle: person
        ? `${person.peran}${person.isIntern ? ' · Intern' : ''}`
        : brand
          ? `Brand ${brand.grup}`
          : groupBy === 'divisi'
            ? `Divisi ${key}`
            : 'Menunggu lead memilih anggota',
      initials: initials(key),
      color: BOARD_COLORS[i++ % BOARD_COLORS.length],
      load: active,
      capacity: person?.capacity || (groupBy === 'anggota' ? 5 : Math.max(active, 10)),
      lanes,
      stats: {
        active,
        doneMonth: finishedMonth.length,
        onTimePct: finishedMonth.length ? Math.round((onTime / finishedMonth.length) * 100) : null,
      },
      updates,
    });
  }

  // Yang paling sibuk/bermasalah tampil duluan
  return cards.sort(
    (a, b) =>
      b.lanes.blocker.length - a.lanes.blocker.length ||
      b.load - a.load ||
      a.title.localeCompare(b.title),
  );
}
