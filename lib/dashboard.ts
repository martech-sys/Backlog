import {
  ACTIVE_STATUSES,
  DONE_STATUSES,
  STAGES,
  STATUS,
  type RequestRow,
  type Status,
  type StatusLogRow,
  type TaskRow,
} from './config';
import { addDays, daysBetweenTimestamps, diffDays, formatWib } from './dates';
import type { Master } from './master';

export interface DashboardFilters {
  from: string;
  to: string;
  grup: string;
  brand: string;
  divisi: string;
  anggota: string;
}

export interface DashboardData {
  filters: DashboardFilters;
  kpi: {
    requestsIn: number;
    requestsPrev: number;
    onTimePct: number | null;
    onTimeCount: number;
    doneCount: number;
    avgRevisi: number | null;
    overdueNow: number;
    activeTasks: number;
  };
  requestsPerBrand: { brand: string; grup: string; count: number }[];
  statusPosition: { status: string; count: number }[];
  workload: { name: string; divisi: string; count: number; capacity: number; over: boolean }[];
  stageDurations: { stage: string; side: 'tim' | 'brand'; avgDays: number | null; samples: number }[];
  revisiPerBrand: { brand: string; avg: number; tasks: number }[];
  watchlist: {
    taskId: string;
    requestId: string;
    brand: string;
    divisi: string;
    assignee: string;
    deadline: string;
    status: string;
    daysLeft: number;
    urgent: boolean;
  }[];
  options: { grups: string[]; brands: string[]; divisi: string[]; anggota: string[] };
}

const NON_CREATIVE_DIVISI = ['management', 'traffic', 'brand'];

export function defaultFilters(today: string, overrides: Partial<DashboardFilters> = {}): DashboardFilters {
  const f: DashboardFilters = {
    from: addDays(today, -29),
    to: today,
    grup: '',
    brand: '',
    divisi: '',
    anggota: '',
  };
  for (const [k, v] of Object.entries(overrides)) {
    if (typeof v === 'string' && v.trim()) (f as unknown as Record<string, string>)[k] = v.trim();
  }
  if (f.from > f.to) [f.from, f.to] = [f.to, f.from];
  return f;
}

const inRange = (ts: string, from: string, to: string) => {
  const d = (ts || '').slice(0, 10);
  return !!d && d >= from && d <= to;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeDashboard(params: {
  master: Master;
  requests: RequestRow[];
  tasks: TaskRow[];
  statusLog: StatusLogRow[];
  filters: DashboardFilters;
  now: Date;
}): DashboardData {
  const { master, filters: f } = params;
  const nowTs = formatWib(params.now);
  const today = nowTs.slice(0, 10);

  const matchReq = (r: Pick<RequestRow, 'Grup' | 'Brand'>) =>
    (!f.grup || r.Grup === f.grup) && (!f.brand || r.Brand === f.brand);
  const matchTask = (t: TaskRow) =>
    matchReq(t) && (!f.divisi || t.Divisi === f.divisi) && (!f.anggota || t.Assignee === f.anggota);

  const requests = params.requests.filter(matchReq);
  const tasks = params.tasks.filter(matchTask);

  // KPI: request masuk (periode ini vs periode sebelumnya dengan panjang sama)
  const span = diffDays(f.from, f.to) + 1;
  const prevTo = addDays(f.from, -1);
  const prevFrom = addDays(prevTo, -(span - 1));
  const reqInPeriod = requests.filter((r) => inRange(r.Timestamp, f.from, f.to));
  const requestsPrev = requests.filter((r) => inRange(r.Timestamp, prevFrom, prevTo)).length;

  // KPI: tepat waktu & revisi (task yang mencapai Final di periode ini)
  const finished = tasks.filter((t) => t['Selesai Pada'] && inRange(t['Selesai Pada'], f.from, f.to));
  const onTimeCount = finished.filter((t) => t['Selesai Pada'].slice(0, 10) <= t.Deadline.slice(0, 10)).length;
  const avgRevisi = finished.length
    ? round1(finished.reduce((s, t) => s + (Number(t['Ronde Revisi']) || 0), 0) / finished.length)
    : null;

  // Daftar overdue & mepet (saat ini)
  const open = tasks.filter((t) => !DONE_STATUSES.includes(t.Status as Status));
  const watch = open
    .filter((t) => t.Deadline)
    .map((t) => ({
      taskId: t['Task ID'],
      requestId: t['Request ID'],
      brand: t.Brand,
      divisi: t.Divisi,
      assignee: t.Assignee,
      deadline: t.Deadline,
      status: t.Status,
      daysLeft: diffDays(today, t.Deadline.slice(0, 10)),
      urgent: t.Urgent === 'Ya',
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft || a.taskId.localeCompare(b.taskId));
  const overdueNow = watch.filter((w) => w.daysLeft < 0).length;

  // Request per brand
  const brandCounts = new Map<string, number>();
  for (const r of reqInPeriod) brandCounts.set(r.Brand, (brandCounts.get(r.Brand) || 0) + 1);
  const requestsPerBrand = master.brands
    .filter((b) => (!f.grup || b.grup === f.grup) && (!f.brand || b.name === f.brand))
    .map((b) => ({ brand: b.name, grup: b.grup, count: brandCounts.get(b.name) || 0 }))
    .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand));

  // Posisi pekerjaan saat ini
  const pos = new Map<string, number>();
  if (!f.divisi && !f.anggota) {
    for (const r of requests) {
      if (r.Status === STATUS.BARU || r.Status === STATUS.BRIEF_KURANG) pos.set(r.Status, (pos.get(r.Status) || 0) + 1);
    }
  }
  for (const t of tasks) if (t.Status !== STATUS.SELESAI) pos.set(t.Status, (pos.get(t.Status) || 0) + 1);
  const statusPosition = [
    STATUS.BARU,
    STATUS.BRIEF_KURANG,
    STATUS.SIAP_ASSIGN,
    STATUS.DIKERJAKAN,
    STATUS.QC_LEAD,
    STATUS.REVISI_INTERNAL,
    STATUS.REVIEW_BRAND,
    STATUS.REVISI_BRAND,
    STATUS.ACC,
    STATUS.FINAL,
  ].map((s) => ({ status: s, count: pos.get(s) || 0 }));

  // Beban per anggota (task aktif)
  const load = new Map<string, number>();
  for (const t of tasks) {
    if (t.Assignee && ACTIVE_STATUSES.includes(t.Status as Status)) load.set(t.Assignee, (load.get(t.Assignee) || 0) + 1);
  }
  const creative = master.people.filter(
    (p) =>
      p.active &&
      !NON_CREATIVE_DIVISI.includes(p.divisi.toLowerCase()) &&
      (!f.divisi || p.divisi === f.divisi) &&
      (!f.anggota || p.name === f.anggota) &&
      (!f.grup || p.grup === 'Semua' || p.grup === f.grup || load.has(p.name)),
  );
  const names = new Set([...creative.map((p) => p.name), ...load.keys()]);
  const workload = [...names]
    .map((name) => {
      const p = master.people.find((x) => x.name === name);
      const count = load.get(name) || 0;
      const capacity = p?.capacity || 5;
      return { name, divisi: p?.divisi || '-', count, capacity, over: count > capacity };
    })
    .filter((w) => !f.anggota || w.name === f.anggota)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  // Lama per tahap (rata-rata hari per item), dari log status item yang dibuat di periode ini
  const idsInScope = new Set<string>([
    ...(f.divisi || f.anggota ? [] : reqInPeriod.map((r) => r['Request ID'])),
    ...tasks.filter((t) => inRange(t.Dibuat, f.from, f.to)).map((t) => t['Task ID']),
  ]);
  const logsById = new Map<string, StatusLogRow[]>();
  for (const l of params.statusLog) {
    if (!idsInScope.has(l.ID) || l.Dari === l.Ke) continue;
    const arr = logsById.get(l.ID) || [];
    arr.push(l);
    logsById.set(l.ID, arr);
  }
  const stageTotals = new Map<string, { sum: number; n: number }>();
  for (const logs of logsById.values()) {
    logs.sort((a, b) => a.Timestamp.localeCompare(b.Timestamp));
    const perStage = new Map<string, number>();
    logs.forEach((l, i) => {
      const stage = STAGES.find((s) => s.statuses.includes(l.Ke as Status));
      if (!stage) return;
      const end = logs[i + 1]?.Timestamp || nowTs;
      perStage.set(stage.name, (perStage.get(stage.name) || 0) + daysBetweenTimestamps(l.Timestamp, end));
    });
    for (const [stage, days] of perStage) {
      const cur = stageTotals.get(stage) || { sum: 0, n: 0 };
      stageTotals.set(stage, { sum: cur.sum + days, n: cur.n + 1 });
    }
  }
  const stageDurations = STAGES.map((s) => {
    const t = stageTotals.get(s.name);
    return { stage: s.name, side: s.side, avgDays: t && t.n ? round1(t.sum / t.n) : null, samples: t?.n || 0 };
  });

  // Rata-rata revisi per brand
  const revByBrand = new Map<string, { sum: number; n: number }>();
  for (const t of finished) {
    const cur = revByBrand.get(t.Brand) || { sum: 0, n: 0 };
    revByBrand.set(t.Brand, { sum: cur.sum + (Number(t['Ronde Revisi']) || 0), n: cur.n + 1 });
  }
  const revisiPerBrand = [...revByBrand.entries()]
    .map(([brand, v]) => ({ brand, avg: round1(v.sum / v.n), tasks: v.n }))
    .sort((a, b) => b.avg - a.avg || a.brand.localeCompare(b.brand));

  return {
    filters: f,
    kpi: {
      requestsIn: reqInPeriod.length,
      requestsPrev,
      onTimePct: finished.length ? Math.round((onTimeCount / finished.length) * 100) : null,
      onTimeCount,
      doneCount: finished.length,
      avgRevisi,
      overdueNow,
      activeTasks: open.length,
    },
    requestsPerBrand,
    statusPosition,
    workload,
    stageDurations,
    revisiPerBrand,
    watchlist: watch.filter((w) => w.daysLeft <= 2).slice(0, 20),
    options: {
      grups: master.grups.map((g) => g.name),
      brands: master.brands.filter((b) => !f.grup || b.grup === f.grup).map((b) => b.name),
      divisi: [...new Set(master.kategori.map((k) => k.divisi))],
      anggota: master.people
        .filter((p) => p.active && !NON_CREATIVE_DIVISI.includes(p.divisi.toLowerCase()))
        .map((p) => p.name)
        .sort(),
    },
  };
}
