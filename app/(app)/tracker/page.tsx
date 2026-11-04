import Link from 'next/link';
import { DONE_STATUSES, TASK_STATUSES, type Status, type TaskRow } from '@/lib/config';
import { now } from '@/lib/clock';
import { diffDays, formatTanggal, todayWib } from '@/lib/dates';
import { getDb, requireUser } from '@/lib/session';
import { Flash, Sisa, StatusBadge, UrgentBadge } from '@/components/ui';
import type { CurrentUser } from '@/lib/workflow';

export const metadata = { title: 'Tracker' };

type SP = Promise<Record<string, string | undefined>>;

const VIEWS = [
  { key: 'aktif', label: 'Semua aktif' },
  { key: 'mine', label: 'Terkait saya' },
  { key: 'bola', label: 'Bola di saya' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'urgent', label: 'URGENT' },
  { key: 'selesai', label: 'Final & selesai' },
  { key: 'semua', label: 'Semua' },
] as const;

function involves(u: CurrentUser, t: TaskRow) {
  return t.Assignee === u.name || t.Lead === u.name || t['PIC Brand'] === u.name;
}

function ballIsMine(u: CurrentUser, t: TaskRow, traffic: string) {
  const b = t['Bola di'];
  if (b.includes(u.name)) return true;
  if (b.startsWith('Traffic') && traffic === u.name) return true;
  return false;
}

export default async function TrackerPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const db = await getDb();
  const today = todayWib(now());
  const reqById = new Map(db.requests.map((r) => [r['Request ID'], r]));
  const view = (VIEWS.find((v) => v.key === sp.view)?.key || (sp.mine ? 'mine' : 'aktif')) as (typeof VIEWS)[number]['key'];
  const q = (sp.q || '').toLowerCase();

  const isDone = (t: TaskRow) => DONE_STATUSES.includes(t.Status as Status);
  const matchView = (key: (typeof VIEWS)[number]['key'], t: TaskRow) => {
    switch (key) {
      case 'aktif':
        return !isDone(t);
      case 'mine':
        return involves(user, t);
      case 'bola':
        return !isDone(t) && ballIsMine(user, t, reqById.get(t['Request ID'])?.Traffic || '');
      case 'overdue':
        return !isDone(t) && !!t.Deadline && t.Deadline.slice(0, 10) < today;
      case 'urgent':
        return !isDone(t) && t.Urgent === 'Ya';
      case 'selesai':
        return isDone(t);
      default:
        return true;
    }
  };

  const filtered = db.tasks
    .filter((t) => matchView(view, t))
    .filter(
      (t) =>
        (!sp.grup || t.Grup === sp.grup) &&
        (!sp.brand || t.Brand === sp.brand) &&
        (!sp.divisi || t.Divisi === sp.divisi) &&
        (!sp.status || t.Status === sp.status) &&
        (!sp.anggota || t.Assignee === sp.anggota) &&
        (!q ||
          `${t['Task ID']} ${t.Brand} ${t.Kategori} ${t.Assignee} ${t.Lead} ${reqById.get(t['Request ID'])?.['Campaign Name'] || ''}`
            .toLowerCase()
            .includes(q)),
    )
    .sort((a, b) => {
      if (view === 'selesai') return (b['Selesai Pada'] || '').localeCompare(a['Selesai Pada'] || '');
      return (a.Deadline || '9999').localeCompare(b.Deadline || '9999') || a['Task ID'].localeCompare(b['Task ID']);
    });

  const counts = Object.fromEntries(VIEWS.map((v) => [v.key, db.tasks.filter((t) => matchView(v.key, t)).length]));

  const keep = (patch: Record<string, string>) => {
    const p = new URLSearchParams(
      Object.entries({ ...sp, ...patch }).filter(([k, v]) => v && k !== 'ok' && k !== 'err' && k !== 'mine') as [string, string][],
    );
    return `/tracker?${p}`;
  };
  const brands = db.master.brands.filter((b) => !sp.grup || b.grup === sp.grup).map((b) => b.name);
  const divisi = [...new Set(db.master.kategori.map((k) => k.divisi))];
  const anggota = [...new Set(db.tasks.map((t) => t.Assignee).filter(Boolean))].sort();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tracker</h1>
          <p>Semua task tim creative dengan status baku, penanggung jawab, dan posisi bola.</p>
        </div>
        <div className="actions-row">
          <Link className="btn" href="/backlog">
            Lihat sebagai papan
          </Link>
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="tabs">
        {VIEWS.map((v) => (
          <Link key={v.key} href={keep({ view: v.key })} className={view === v.key ? 'active' : ''}>
            {v.label}
            <span className="count">{counts[v.key]}</span>
          </Link>
        ))}
      </div>

      <form className="filters">
        <input type="hidden" name="view" value={view} />
        <div className="field">
          <label htmlFor="grup">Grup</label>
          <select id="grup" name="grup" defaultValue={sp.grup || ''}>
            <option value="">Semua</option>
            {db.master.grups.map((g) => (
              <option key={g.name}>{g.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="brand">Brand</label>
          <select id="brand" name="brand" defaultValue={sp.brand || ''}>
            <option value="">Semua</option>
            {brands.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="divisi">Divisi</label>
          <select id="divisi" name="divisi" defaultValue={sp.divisi || ''}>
            <option value="">Semua</option>
            {divisi.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={sp.status || ''}>
            <option value="">Semua</option>
            {TASK_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="anggota">Assignee</label>
          <select id="anggota" name="anggota" defaultValue={sp.anggota || ''}>
            <option value="">Semua</option>
            {anggota.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="field wide">
          <label htmlFor="q">Cari</label>
          <input id="q" type="search" name="q" placeholder="ID, brand, campaign, nama" defaultValue={sp.q || ''} />
        </div>
        <button className="btn primary" type="submit">
          Terapkan
        </button>
        <Link className="btn" href={`/tracker?view=${view}`}>
          Reset
        </Link>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Brand · Campaign</th>
              <th>Kategori</th>
              <th>Assignee</th>
              <th>Status</th>
              <th>Bola di</th>
              <th>Deadline</th>
              <th>Sisa</th>
              <th>Revisi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="empty">
                  Tidak ada task.
                </td>
              </tr>
            ) : (
              filtered.map((t) => {
                const r = reqById.get(t['Request ID']);
                const late = !isDone(t) && t.Deadline && diffDays(today, t.Deadline.slice(0, 10)) < 0;
                return (
                  <tr key={t['Task ID']}>
                    <td className="nowrap">
                      <Link className="title" href={`/tasks/${t['Task ID']}`}>
                        {t['Task ID']}
                      </Link>
                      <div className="row" style={{ gap: 4, marginTop: 2 }}>
                        <UrgentBadge urgent={t.Urgent} />
                        {late ? <span className="badge red">Overdue</span> : null}
                      </div>
                    </td>
                    <td>
                      <div className="title">{t.Brand}</div>
                      <div className="subtle">{r?.['Campaign Name'] || '-'}</div>
                    </td>
                    <td>
                      {t.Kategori}
                      <div className="subtle">
                        {t.Divisi}
                        {t['Sub-jenis'] ? ` · ${t['Sub-jenis']}` : ''}
                      </div>
                    </td>
                    <td>
                      {t.Assignee || <span className="badge outline">Belum assign</span>}
                      <div className="subtle">Lead: {t.Lead}</div>
                    </td>
                    <td>
                      <StatusBadge status={t.Status} />
                    </td>
                    <td>{t['Bola di']}</td>
                    <td className="nowrap">{formatTanggal(t.Deadline)}</td>
                    <td className="nowrap">
                      <Sisa deadline={t.Deadline} today={today} done={isDone(t)} />
                    </td>
                    <td>{Number(t['Ronde Revisi']) || 0}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="subtle" style={{ marginTop: 8 }}>
        {filtered.length} task
      </p>
    </>
  );
}
