import Link from 'next/link';
import { CATEGORIES, CUSTOM_CATEGORY, DONE_STATUSES, STAGES, TASK_STATUSES, type Status, type TaskRow } from '@/lib/config';
import { FilterChips } from '@/components/FilterChips';
import { inPeriod } from '@/lib/drill';
import { now } from '@/lib/clock';
import { addDays, diffDays, formatTanggal, todayWib } from '@/lib/dates';
import { ballIsMine, seenKey, urgency } from '@/lib/mine';
import { NewMarker } from '@/components/SeenMarker';
import { getDb, requireUser } from '@/lib/session';
import { Flash, Sisa, StatusBadge, UrgentBadge } from '@/components/ui';
import type { CurrentUser } from '@/lib/workflow';

export const metadata = { title: 'Tracker' };

type SP = Promise<Record<string, string | undefined>>;

const VIEWS = [
  { key: 'bola', label: 'Tugas saya' },
  { key: 'aktif', label: 'Semua aktif' },
  { key: 'mine', label: 'Terkait saya' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'urgent', label: 'URGENT' },
  { key: 'selesai', label: 'Final & selesai' },
  { key: 'semua', label: 'Semua' },
] as const;

const FILTER_LABELS: Record<string, string> = {
  grup: 'Grup',
  brand: 'Brand',
  kategori: 'Kategori',
  divisi: 'Divisi',
  status: 'Status',
  tahap: 'Tahap',
  anggota: 'Assignee',
  from: 'Selesai',
  q: 'Cari',
};

function involves(u: CurrentUser, t: TaskRow) {
  return t.Assignee === u.name || t.Lead === u.name || t['PIC Brand'] === u.name;
}

export default async function TrackerPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const db = await getDb();
  const today = todayWib(now());
  const tomorrow = addDays(today, 1);
  const reqById = new Map(db.requests.map((r) => [r['Request ID'], r]));
  const view = (VIEWS.find((v) => v.key === sp.view)?.key || (sp.mine ? 'mine' : 'aktif')) as (typeof VIEWS)[number]['key'];
  const q = (sp.q || '').toLowerCase();
  const stage = STAGES.find((x) => x.name === sp.tahap);

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
        (!sp.kategori || t.Kategori === sp.kategori) &&
        (!stage || stage.statuses.includes(t.Status as Status)) &&
        (!sp.from || (!!t['Selesai Pada'] && inPeriod(t['Selesai Pada'], sp.from, sp.to))) &&
        (!sp.anggota || t.Assignee === sp.anggota) &&
        (!q ||
          `${t['Task ID']} ${t.Brand} ${t.Kategori} ${t['Jenis Custom'] || ''} ${t.Assignee} ${t.Lead} ${reqById.get(t['Request ID'])?.['Campaign Name'] || ''}`
            .toLowerCase()
            .includes(q)),
    )
    .sort((a, b) => {
      if (sp.sort === 'lama') return (a['Status Sejak'] || '').localeCompare(b['Status Sejak'] || '');
      if (sp.sort === 'revisi') return (Number(b['Ronde Revisi']) || 0) - (Number(a['Ronde Revisi']) || 0);
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

      <FilterChips
        path="/tracker"
        sp={sp}
        labels={FILTER_LABELS}
        format={(k, v) => (k === 'from' ? `${formatTanggal(v, false)} – ${formatTanggal(sp.to || v, false)}` : v)}
      />
      {sp.sort ? (
        <p className="subtle" style={{ marginTop: -4 }}>
          Diurutkan: {sp.sort === 'lama' ? 'paling lama di status saat ini lebih dulu' : 'ronde revisi terbanyak lebih dulu'}.
        </p>
      ) : null}

      <form className="filters">
        <input type="hidden" name="view" value={view} />
        {(['from', 'to', 'tahap', 'sort', 'src', 'dash'] as const).map((k) =>
          sp[k] ? <input key={k} type="hidden" name={k} value={sp[k]} /> : null,
        )}
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
          <label htmlFor="kategori">Kategori</label>
          <select id="kategori" name="kategori" defaultValue={sp.kategori || ''}>
            <option value="">Semua</option>
            {CATEGORIES.map((c) => (
              <option key={c.name}>{c.name}</option>
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
                const mineRow = ballIsMine(user, t, r?.Traffic || '');
                const urg = urgency(t, today, tomorrow);
                return (
                  <tr key={t['Task ID']} className={[mineRow ? 'mine-row' : '', urg ? `urg-${urg}` : ''].join(' ').trim() || undefined}>
                    <td className="nowrap">
                      <Link className="title" href={`/tasks/${t['Task ID']}`}>
                        {t['Task ID']}
                      </Link>
                      <div className="row" style={{ gap: 4, marginTop: 2 }}>
                        {mineRow ? <span className="badge blue">Tugas kamu</span> : null}
                        {mineRow ? <NewMarker seenKey={seenKey(t)} /> : null}
                        <UrgentBadge urgent={t.Urgent} />
                        {late ? <span className="badge red">Overdue</span> : null}
                      </div>
                    </td>
                    <td>
                      <div className="title">{t.Brand}</div>
                      <div className="subtle">{r?.['Campaign Name'] || '-'}</div>
                    </td>
                    <td>
                      {t.Kategori === CUSTOM_CATEGORY ? (
                        <>
                          <span className="badge violet">Custom</span> {t['Jenis Custom'] || <span className="subtle">belum diatur</span>}
                        </>
                      ) : (
                        t.Kategori
                      )}
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
                    <td className="nowrap deadline-cell">{formatTanggal(t.Deadline)}</td>
                    <td className="nowrap">
                      <Sisa deadline={t.Deadline} today={today} done={isDone(t)} />
                    </td>
                    <td>
                      <span className={(Number(t['Ronde Revisi']) || 0) > 2 ? 'rev-warn' : ''}>{Number(t['Ronde Revisi']) || 0}</span>
                      {sp.sort === 'lama' ? (
                        <div className="subtle">sejak {formatTanggal(t['Status Sejak'].slice(0, 10), false)}</div>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="subtle" style={{ marginTop: 8 }}>
        {filtered.length} task · <span style={{ color: 'var(--danger)' }}>merah</span> = overdue/URGENT,{' '}
        <span style={{ color: 'var(--warning)' }}>oranye</span> = deadline hari ini/besok, baris biru = bola di kamu.
      </p>
    </>
  );
}
