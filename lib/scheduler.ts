/**
 * Pekerjaan terjadwal (dipanggil Vercel Cron lewat /api/cron/*):
 *  - reminders : reminder H-2, H-1, hari H; notifikasi overdue; eskalasi ke Creative Head
 *  - digest    : ringkasan pagi untuk Traffic per grup
 *  - weekly    : rekap mingguan untuk Creative Head & Head of Creative Production
 */
import { DONE_STATUSES, PRODUCTION_STATUSES, SHEETS, STATUS, type Status, type TaskRow } from './config';
import { now } from './clock';
import { computeDashboard, defaultFilters } from './dashboard';
import { addDays, diffDays, todayWib } from './dates';
import { loadDb } from './db';
import { heads } from './master';
import { msg } from './messages';
import { Notifier } from './notify';
import type { Cell, Store } from './store';

export interface JobResult {
  job: string;
  messages: number;
  details: Record<string, number>;
}

function sentKeys(t: TaskRow): Set<string> {
  return new Set(
    String(t['Reminder Terkirim'] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export async function runReminders(store: Store): Promise<JobResult> {
  const db = await loadDb(store, { fresh: true });
  const today = todayWib(now());
  const notify = new Notifier(db.master);
  const updates: { key: string; patch: Record<string, Cell> }[] = [];
  const escalate = new Map<string, { t: TaskRow; late: number }[]>();
  const counts = { reminder: 0, overdue: 0, escalated: 0 };

  for (const t of db.tasks) {
    if (DONE_STATUSES.includes(t.Status as Status) || !t.Deadline) continue;
    const daysLeft = diffDays(today, t.Deadline.slice(0, 10));
    const keys = sentKeys(t);
    let changed = false;

    if (daysLeft >= 0 && PRODUCTION_STATUSES.includes(t.Status as Status) && db.master.config.reminderDays.includes(daysLeft)) {
      const key = `H-${daysLeft}@${t.Deadline.slice(0, 10)}`;
      if (!keys.has(key)) {
        notify.to(t.Assignee || t.Lead, 'Reminder', t['Task ID'], msg.reminder(t, daysLeft));
        keys.add(key);
        changed = true;
        counts.reminder++;
      }
    }

    if (daysLeft < 0) {
      const key = `OD@${today}`;
      if (!keys.has(key)) {
        const late = -daysLeft;
        const who = t.Status === STATUS.REVIEW_BRAND ? [t['PIC Brand'], t.Lead] : [t.Assignee || t.Lead, t.Lead];
        notify.toMany(who, 'Overdue', t['Task ID'], msg.overdue(t, late));
        for (const k of [...keys]) if (k.startsWith('OD@')) keys.delete(k);
        keys.add(key);
        changed = true;
        counts.overdue++;
        if (late >= db.master.config.escalateAfterDays) {
          const arr = escalate.get(t.Grup) || [];
          arr.push({ t, late });
          escalate.set(t.Grup, arr);
        }
      }
    }

    if (changed) updates.push({ key: t['Task ID'], patch: { 'Reminder Terkirim': [...keys].join(',') } });
  }

  const hocp = db.master.people.filter((p) => p.active && p.roles.includes('hocp')).map((p) => p.name);
  for (const [grup, items] of escalate) {
    items.sort((a, b) => b.late - a.late);
    const head = db.master.grups.find((g) => g.name === grup)?.creativeHead;
    notify.toMany([head, ...hocp], 'Eskalasi overdue', grup, msg.escalation(items));
    counts.escalated += items.length;
  }

  if (updates.length) await store.update(SHEETS.TASK, 'Task ID', updates);
  const messages = await notify.flush(store);
  return { job: 'reminders', messages, details: counts };
}

export async function runDigest(store: Store): Promise<JobResult> {
  const db = await loadDb(store, { fresh: true });
  const today = todayWib(now());
  const notify = new Notifier(db.master);
  const details: Record<string, number> = {};

  for (const g of db.master.grups) {
    const reqs = db.requests.filter((r) => r.Grup === g.name);
    const tasks = db.tasks.filter((t) => t.Grup === g.name && !DONE_STATUSES.includes(t.Status as Status));
    const overdue = tasks.filter((t) => t.Deadline && t.Deadline.slice(0, 10) < today);
    const dueToday = tasks.filter((t) => t.Deadline.slice(0, 10) === today);
    notify.to(
      g.traffic,
      'Digest pagi',
      g.name,
      msg.digest({
        grup: g.name,
        date: today,
        newRequests: reqs.filter((r) => r.Status === STATUS.BARU),
        briefKurang: reqs.filter((r) => r.Status === STATUS.BRIEF_KURANG).length,
        urgent: tasks.filter((t) => t.Urgent === 'Ya').length,
        dueToday,
        overdue,
        waitingBrand: tasks.filter((t) => t.Status === STATUS.REVIEW_BRAND).length,
      }),
    );
    details[g.name] = overdue.length;
  }
  const messages = await notify.flush(store);
  return { job: 'digest', messages, details };
}

export async function runWeekly(store: Store): Promise<JobResult> {
  const db = await loadDb(store, { fresh: true });
  const n = now();
  const today = todayWib(n);
  const notify = new Notifier(db.master);
  const from = addDays(today, -7);
  const to = addDays(today, -1);

  const summary = (grup: string, scope: string) => {
    const d = computeDashboard({
      master: db.master,
      requests: db.requests,
      tasks: db.tasks,
      statusLog: db.statusLog,
      filters: defaultFilters(today, { from, to, grup }),
      now: n,
    });
    return msg.weekly({
      scope,
      from,
      to,
      requests: d.kpi.requestsIn,
      done: d.kpi.doneCount,
      onTimePct: d.kpi.onTimePct,
      avgRevisi: d.kpi.avgRevisi,
      overdue: d.kpi.overdueNow,
      topBrands: d.requestsPerBrand.filter((b) => b.count > 0).slice(0, 3).map((b) => ({ name: b.brand, count: b.count })),
      busiest: d.workload.filter((w) => w.count > 0).slice(0, 3).map((w) => ({ name: w.name, count: w.count })),
    });
  };

  for (const g of db.master.grups) notify.to(g.creativeHead, 'Rekap mingguan', g.name, summary(g.name, g.name));
  const all = summary('', 'semua grup');
  for (const p of heads(db.master).filter((p) => p.roles.includes('hocp'))) notify.to(p.name, 'Rekap mingguan', 'Semua', all);

  const messages = await notify.flush(store);
  return { job: 'weekly', messages, details: {} };
}

