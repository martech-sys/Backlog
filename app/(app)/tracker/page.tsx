import Link from 'next/link';
import { CUSTOM_CATEGORY, DONE_STATUSES, STAGES, TASK_STATUSES, type Status, type TaskRow } from '@/lib/config';
import { FilterChips } from '@/components/FilterChips';
import { categoryDefs } from '@/lib/categories';
import { inPeriod } from '@/lib/drill';
import { now } from '@/lib/clock';
import { addDays, diffDays, formatTanggal, todayWib } from '@/lib/dates';
import { ballIsMine, seenKey, urgency } from '@/lib/mine';
import { NewMarker } from '@/components/SeenMarker';
import { Journey } from '@/components/Journey';
import { journeyCounts, journeyOf } from '@/lib/journey';
import { REVISI_STATUSES } from '@/lib/revisi';
import { getBadges, getDb, requireUser } from '@/lib/session';
import { MarkMenuSeen } from '@/components/MarkMenuSeen';
import { Flash, HealthBadge, Sisa, StatusBadge, UrgentBadge } from '@/components/ui';
import { bySubmittedDesc, HEALTH_LEVELS, submittedAt, taskHealth, taskTitle } from '@/lib/taskInfo';
import type { CurrentUser } from '@/lib/workflow';
import { archiveTaskAction, restoreTaskAction } from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';
import { canArchive } from '@/lib/service';

export const metadata = { title: 'Tracker' };

type SP = Promise<Record<string, string | undefined>>;

const VIEWS = [
  { key: 'bola', label: 'My tasks' },
  { key: 'aktif', label: 'All active' },
  { key: 'mine', label: 'Involving me' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'urgent', label: 'URGENT' },
  { key: 'selesai', label: 'Final & done' },
  { key: 'semua', label: 'All' },
  { key: 'arsip', label: 'Deleted' },
] as const;

const FILTER_LABELS: Record<string, string> = {
  grup: 'Group',
  brand: 'Brand',
  kategori: 'Category',
  divisi: 'Division',
  status: 'Status',
  health: 'Health',
  tahap: 'Stage',
  anggota: 'Assignee',
  from: 'Completed',
  q: 'Search',
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
  const admin = canArchive(user);
  const views = VIEWS.filter((v) => v.key !== 'arsip' || admin);
  const view = (views.find((v) => v.key === sp.view)?.key || (sp.mine ? 'mine' : 'aktif')) as (typeof VIEWS)[number]['key'];
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
      case 'arsip':
        return true;
      default:
        return true;
    }
  };

  const matchStatus = (t: TaskRow) =>
    !sp.status || (sp.status === 'Revisi' ? REVISI_STATUSES.includes(t.Status) : t.Status === sp.status);
  // Semua filter selain tab & status (dipakai juga untuk hitungan pipeline journey).
  const matchOther = (t: TaskRow) =>
        (!sp.grup || t.Grup === sp.grup) &&
        (!sp.brand || t.Brand === sp.brand) &&
        (!sp.divisi || t.Divisi === sp.divisi) &&
        (!sp.kategori || t.Kategori === sp.kategori) &&
        (!stage || stage.statuses.includes(t.Status as Status)) &&
        (!sp.from || (!!t['Selesai Pada'] && inPeriod(t['Selesai Pada'], sp.from, sp.to))) &&
        (!sp.anggota || t.Assignee === sp.anggota) &&
        (!sp.health || taskHealth(t, today)?.key === sp.health) &&
        (!q ||
          `${t['Task ID']} ${taskTitle(t, reqById.get(t['Request ID']))} ${t.Brand} ${t.Kategori} ${t['Jenis Custom'] || ''} ${t.Assignee} ${t.Lead} ${reqById.get(t['Request ID'])?.['Campaign Name'] || ''}`
            .toLowerCase()
            .includes(q));
  // Default: urut waktu pengajuan (terbaru di atas). Urutan tetap stabil apa pun filternya.
  const bySubmitted = bySubmittedDesc<TaskRow>(reqById);
  const source = view === 'arsip' ? db.archivedTasks : db.tasks;
  const filtered = source
    .filter((t) => matchView(view, t) && matchStatus(t) && matchOther(t))
    .sort((a, b) => {
      if (sp.sort === 'lama') return (a['Status Sejak'] || '').localeCompare(b['Status Sejak'] || '') || bySubmitted(a, b);
      if (sp.sort === 'revisi') return (Number(b['Ronde Revisi']) || 0) - (Number(a['Ronde Revisi']) || 0) || bySubmitted(a, b);
      if (sp.sort === 'deadline') return (a.Deadline || '9999').localeCompare(b.Deadline || '9999') || bySubmitted(a, b);
      return bySubmitted(a, b);
    });

  const pipeline = journeyCounts(db.tasks.filter(matchOther), today);
  const counts = Object.fromEntries(
    views.map((v) => [v.key, v.key === 'arsip' ? db.archivedTasks.length : db.tasks.filter((t) => matchView(v.key, t)).length]),
  );

  const keep = (patch: Record<string, string>) => {
    const p = new URLSearchParams(
      Object.entries({ ...sp, ...patch }).filter(([k, v]) => v && k !== 'ok' && k !== 'err' && k !== 'mine') as [string, string][],
    );
    return `/tracker?${p}`;
  };
  const brands = db.master.brands.filter((b) => !sp.grup || b.grup === sp.grup).map((b) => b.name);
  const divisi = [...new Set(db.master.kategori.map((k) => k.divisi).filter(Boolean))];
  const anggota = [...new Set(db.tasks.map((t) => t.Assignee).filter(Boolean))].sort();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tracker</h1>
          <p>Every creative task with its stage, owner, and who holds the ball. Newest submissions first.</p>
        </div>
        <div className="actions-row">
          <Link className="btn" href="/backlog">
            View as board
          </Link>
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <MarkMenuSeen menu="tracker" pending={(await getBadges()).tracker} />

      <div className="tabs">
        {views.map((v) => (
          <Link key={v.key} href={keep({ view: v.key })} className={`${view === v.key ? 'active' : ''}${v.key === 'arsip' ? ' tab-muted' : ''}`}>
            {v.label}
            <span className="count">{counts[v.key]}</span>
          </Link>
        ))}
      </div>

      <nav className="pipeline" aria-label="Progress journey: tasks per stage">
        {pipeline.stages.map((st, i) => (
          <span key={st.status} style={{ display: 'contents' }}>
            {i ? <span className="arrow">→</span> : null}
            <Link
              href={sp.status === st.status ? keep({ status: '' }) : keep({ view: 'semua', status: st.status })}
              className={sp.status === st.status ? 'active' : ''}
              title={`Show tasks in ${st.status}`}
            >
              <span className="n">{st.count}</span>
              <span className="lbl">{st.status}</span>
            </Link>
          </span>
        ))}
        <span className="sep" />
        <Link
          href={sp.status === 'Revisi' ? keep({ status: '' }) : keep({ view: 'semua', status: 'Revisi' })}
          className={`warn${sp.status === 'Revisi' ? ' active' : ''}`}
          title="Tasks in revision (internal or brand)"
        >
          <span className="n">{pipeline.revisi}</span>
          <span className="lbl">Revisi</span>
        </Link>
        <Link href={keep({ view: 'overdue', status: '' })} className={`danger${view === 'overdue' ? ' active' : ''}`} title="Tasks past deadline">
          <span className="n">{pipeline.overdue}</span>
          <span className="lbl">Overdue</span>
        </Link>
      </nav>

      <FilterChips
        path="/tracker"
        sp={sp}
        labels={FILTER_LABELS}
        format={(k, v) =>
          k === 'from'
            ? `${formatTanggal(v, false)} – ${formatTanggal(sp.to || v, false)}`
            : k === 'health'
              ? HEALTH_LEVELS.find((h) => h.key === v)?.badge || v
              : v
        }
      />
      {sp.sort ? (
        <p className="subtle" style={{ marginTop: -4 }}>
          Sorted by:{' '}
          {sp.sort === 'lama' ? 'longest in current stage first' : sp.sort === 'deadline' ? 'nearest deadline first' : 'most revision rounds first'}.{' '}
          <Link href={keep({ sort: '' })}>Back to newest submissions</Link>
        </p>
      ) : null}

      <form className="filters">
        <input type="hidden" name="view" value={view} />
        {(['from', 'to', 'tahap', 'sort', 'src', 'dash'] as const).map((k) =>
          sp[k] ? <input key={k} type="hidden" name={k} value={sp[k]} /> : null,
        )}
        <div className="field">
          <label htmlFor="grup">Group</label>
          <select id="grup" name="grup" defaultValue={sp.grup || ''}>
            <option value="">All</option>
            {db.master.grups.map((g) => (
              <option key={g.name}>{g.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="brand">Brand</label>
          <select id="brand" name="brand" defaultValue={sp.brand || ''}>
            <option value="">All</option>
            {brands.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="divisi">Division</label>
          <select id="divisi" name="divisi" defaultValue={sp.divisi || ''}>
            <option value="">All</option>
            {divisi.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="kategori">Category</label>
          <select id="kategori" name="kategori" defaultValue={sp.kategori || ''}>
            <option value="">All</option>
            {categoryDefs(db.master, { includeInactive: true }).map((c) => (
              <option key={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={sp.status || ''}>
            <option value="">All</option>
            {TASK_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="health">Health</label>
          <select id="health" name="health" defaultValue={sp.health || ''}>
            <option value="">All</option>
            {HEALTH_LEVELS.map((h) => (
              <option key={h.key} value={h.key}>
                {h.badge} · {h.value}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="anggota">Assignee</label>
          <select id="anggota" name="anggota" defaultValue={sp.anggota || ''}>
            <option value="">All</option>
            {anggota.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="field wide">
          <label htmlFor="q">Search</label>
          <input id="q" type="search" name="q" placeholder="Title, ID, brand, campaign, name" defaultValue={sp.q || ''} />
        </div>
        <button className="btn primary" type="submit">
          Apply
        </button>
        <Link className="btn" href={`/tracker?view=${view}`}>
          Reset
        </Link>
      </form>

      <div className="table-wrap">
        <table className="tracker-table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Brand</th>
              <th>Category</th>
              <th>Assignee</th>
              <th>Status</th>
              <th>Health</th>
              <th>Ball with</th>
              <th>Submitted</th>
              <th>Deadline</th>
              <th>Time left</th>
              <th>Rev.</th>
              {admin ? <th aria-label="Actions" /> : null}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={admin ? 12 : 11} className="empty">
                  {view === 'arsip' ? 'No deleted tasks.' : 'No tasks.'}
                </td>
              </tr>
            ) : (
              filtered.map((t) => {
                const r = reqById.get(t['Request ID']);
                const late = !isDone(t) && t.Deadline && diffDays(today, t.Deadline.slice(0, 10)) < 0;
                const mineRow = ballIsMine(user, t, r?.Traffic || '');
                const urg = urgency(t, today, tomorrow);
                const sub = submittedAt(t, r);
                return (
                  <tr key={t['Task ID']} className={[mineRow ? 'mine-row' : '', urg ? `urg-${urg}` : ''].join(' ').trim() || undefined}>
                    <td className="task-cell">
                      {view === 'arsip' ? (
                        <span className="task-title">{taskTitle(t, r)}</span>
                      ) : (
                        <Link className="task-title" href={`/tasks/${t['Task ID']}`}>
                          {taskTitle(t, r)}
                        </Link>
                      )}
                      {r?.['Campaign Name'] && taskTitle(t, r) !== r['Campaign Name'] ? (
                        <div className="task-campaign">{r['Campaign Name']}</div>
                      ) : null}
                      <div className="task-code">{t['Task ID']}</div>
                      <div className="row" style={{ gap: 4, marginTop: 4 }}>
                        {mineRow ? <span className="badge blue">Your task</span> : null}
                        {mineRow ? <NewMarker seenKey={seenKey(t)} /> : null}
                        <UrgentBadge urgent={t.Urgent} />
                        {late ? <span className="badge red">Overdue</span> : null}
                      </div>
                    </td>
                    <td>
                      <div className="title">{t.Brand}</div>
                      <div className="subtle">{t.Grup}</div>
                    </td>
                    <td>
                      {t.Kategori === CUSTOM_CATEGORY ? (
                        <>
                          <span className="badge violet">Custom</span> {t['Jenis Custom'] || <span className="subtle">not set</span>}
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
                      {t.Assignee || <span className="badge outline">Unassigned</span>}
                      <div className="subtle">Lead: {t.Lead || '-'}</div>
                    </td>
                    <td>
                      <StatusBadge status={t.Status} />
                      <Journey pos={journeyOf(t, today)} />
                    </td>
                    <td>
                      <HealthBadge health={taskHealth(t, today)} />
                    </td>
                    <td>{t['Bola di']}</td>
                    <td className="nowrap">
                      {sub ? (
                        <>
                          {formatTanggal(sub.slice(0, 10), false)}
                          <div className="subtle">{sub.slice(11, 16)}</div>
                        </>
                      ) : (
                        <span className="subtle">-</span>
                      )}
                    </td>
                    <td className="nowrap deadline-cell">{formatTanggal(t.Deadline)}</td>
                    <td className="nowrap">
                      <Sisa deadline={t.Deadline} today={today} done={isDone(t)} />
                    </td>
                    <td>
                      <span className={(Number(t['Ronde Revisi']) || 0) > 2 ? 'rev-warn' : ''}>{Number(t['Ronde Revisi']) || 0}</span>
                      {sp.sort === 'lama' ? (
                        <div className="subtle">since {formatTanggal(t['Status Sejak'].slice(0, 10), false)}</div>
                      ) : null}
                    </td>
                    {admin ? (
                      <td className="nowrap">
                        {view === 'arsip' ? (
                          <form action={restoreTaskAction}>
                            <input type="hidden" name="taskId" value={t['Task ID']} />
                            <input type="hidden" name="back" value={keep({})} />
                            <div className="subtle" style={{ maxWidth: 180, whiteSpace: 'normal', marginBottom: 6 }}>
                              Deleted {t.Diarsipkan}
                            </div>
                            <ConfirmButton className="btn small" confirm={`Restore ${t['Task ID']}?`}>
                              Restore
                            </ConfirmButton>
                          </form>
                        ) : (
                          <form action={archiveTaskAction}>
                            <input type="hidden" name="taskId" value={t['Task ID']} />
                            <input type="hidden" name="back" value={keep({})} />
                            <ConfirmButton
                              className="btn small icon-btn"
                              title={`Delete ${t['Task ID']}`}
                              confirm={`Delete ${t['Task ID']} (${taskTitle(t, r)})? It will be moved to the archive; an admin can restore it from the Deleted tab.`}
                            >
                              🗑
                            </ConfirmButton>
                          </form>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="subtle" style={{ marginTop: 8 }}>
        {filtered.length} tasks · <span style={{ color: 'var(--danger)' }}>red</span> = overdue/URGENT,{' '}
        <span style={{ color: 'var(--warning)' }}>orange</span> = due today/tomorrow, blue row = the ball is with you ·{' '}
        <Link href={keep({ sort: 'deadline' })}>sort by deadline</Link>
      </p>
    </>
  );
}
