import Link from 'next/link';
import { FilterChips } from '@/components/FilterChips';
import { categoryDefs } from '@/lib/categories';
import { RowLink } from '@/components/RowLink';
import { REQUEST_STATUS, type RequestRow } from '@/lib/config';
import { inPeriod } from '@/lib/drill';
import { revisionRows } from '@/lib/revisi';
import { now } from '@/lib/clock';
import { formatTanggal, formatWaktu, todayWib } from '@/lib/dates';
import { getDb, requireUser } from '@/lib/session';
import { Flash, Sisa, StatusBadge, UrgentBadge } from '@/components/ui';
import { can } from '@/lib/workflow';
import { bulkCekBriefAction } from '@/app/actions';
import { BulkBar } from '@/components/BulkBar';
import { splitPlan } from '@/lib/service';
import { taskTitle } from '@/lib/taskInfo';

export const metadata = { title: 'Request' };

type SP = Promise<Record<string, string | undefined>>;

const VIEWS = [
  { key: 'cek', label: 'Awaiting brief check' },
  { key: 'kurang', label: 'Brief incomplete' },
  { key: 'proses', label: 'In progress' },
  { key: 'revisi', label: 'Revision' },
  { key: 'selesai', label: 'Done' },
  { key: 'semua', label: 'All' },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];

const FILTER_LABELS: Record<string, string> = {
  grup: 'Group',
  brand: 'Brand',
  kategori: 'Category',
  divisi: 'Division',
  from: 'Period',
  q: 'Search',
};

export default async function RequestsPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const db = await getDb();
  const today = todayWib(now());
  const view =
    VIEWS.find((v) => v.key === sp.view) || (user.roles.includes('pic') && !user.roles.includes('traffic') ? VIEWS[5] : VIEWS[0]);
  const revisi = revisionRows(db);
  const inRevisi = new Set(revisi.map((x) => x.task['Request ID']));
  const divisiOf = new Map<string, Set<string>>();
  for (const t of db.tasks) {
    const set = divisiOf.get(t['Request ID']) || new Set<string>();
    set.add(t.Divisi);
    divisiOf.set(t['Request ID'], set);
  }
  const match = (key: ViewKey, r: RequestRow) => {
    switch (key) {
      case 'cek':
        return r.Status === REQUEST_STATUS.BARU;
      case 'kurang':
        return r.Status === REQUEST_STATUS.BRIEF_KURANG;
      case 'proses':
        return r.Status === REQUEST_STATUS.DIPROSES && !inRevisi.has(r['Request ID']);
      case 'revisi':
        return inRevisi.has(r['Request ID']);
      case 'selesai':
        return r.Status === REQUEST_STATUS.SELESAI;
      default:
        return true;
    }
  };
  const mine =
    sp.mine === '1' ||
    (user.roles.includes('pic') && !sp.mine && !user.roles.some((r) => ['admin', 'traffic', 'head', 'hocp'].includes(r)));
  const q = (sp.q || '').toLowerCase();

  const base = db.requests.filter(
    (r) =>
      (!sp.grup || r.Grup === sp.grup) &&
      (!sp.brand || r.Brand === sp.brand) &&
      (!sp.kategori ||
        r.Kategori.split(',')
          .map((k) => k.trim())
          .includes(sp.kategori)) &&
      (!sp.divisi || !!divisiOf.get(r['Request ID'])?.has(sp.divisi)) &&
      inPeriod(r.Timestamp, sp.from, sp.to) &&
      (!mine || r['PIC Brand'] === user.name || r['Email Requestor'] === user.email) &&
      (!q || `${r['Request ID']} ${r.Judul || ''} ${r.Brand} ${r['Campaign Name']} ${r['PIC Brand']} ${r.Kategori}`.toLowerCase().includes(q)),
  );
  const rows = base.filter((r) => match(view.key, r)).sort((a, b) => b.Timestamp.localeCompare(a.Timestamp));
  const baseIds = new Set(base.map((r) => r['Request ID']));
  const revRows = revisi.filter((x) => baseIds.has(x.task['Request ID']) && (!sp.divisi || x.task.Divisi === sp.divisi));
  const maxRevisi = db.master.config.maxRevisi;
  const tasksBy = new Map<string, number>();
  for (const t of db.tasks) tasksBy.set(t['Request ID'], (tasksBy.get(t['Request ID']) || 0) + 1);
  const defs = categoryDefs(db.master, { includeInactive: true });
  const reqById = new Map(db.requests.map((r) => [r['Request ID'], r]));
  // Aksi massal: hanya request yang menunggu cek brief dan boleh dicek user ini.
  const selectable = (r: RequestRow) =>
    (r.Status === REQUEST_STATUS.BARU || r.Status === REQUEST_STATUS.BRIEF_KURANG) && can.cekBrief(user, r);
  const selectableCount = rows.filter(selectable).length;
  const backHere = keep({});
  function keep(patch: Record<string, string>) {
    return `/requests?${new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([k, v]) => v && k !== 'ok' && k !== 'err') as [string, string][])}`;
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Requests</h1>
          <p>Every content request from brand PICs, from submission to done.</p>
        </div>
        {can.submitRequest(user) ? (
          <Link className="btn primary" href="/requests/new">
            + New request
          </Link>
        ) : null}
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="tabs">
        {VIEWS.map((v) => (
          <Link key={v.key} href={keep({ view: v.key })} className={view.key === v.key ? 'active' : ''}>
            {v.label}
            <span className={`count${v.key === 'revisi' && base.some((r) => match('revisi', r)) ? ' warn' : ''}`}>
              {base.filter((r) => match(v.key, r)).length}
            </span>
          </Link>
        ))}
      </div>

      <FilterChips
        path="/requests"
        sp={sp}
        labels={FILTER_LABELS}
        format={(k, v) => (k === 'from' ? `${formatTanggal(v, false)} – ${formatTanggal(sp.to || v, false)}` : v)}
      />

      <form className="filters">
        <input type="hidden" name="view" value={view.key} />
        {(['from', 'to', 'divisi', 'src', 'dash'] as const).map((k) =>
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
            {db.master.brands.map((b) => (
              <option key={b.name}>{b.name}</option>
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
          <label htmlFor="mine">Submitted by</label>
          <select id="mine" name="mine" defaultValue={mine ? '1' : '0'}>
            <option value="0">Anyone</option>
            <option value="1">My requests</option>
          </select>
        </div>
        <div className="field wide">
          <label htmlFor="q">Search</label>
          <input id="q" type="search" name="q" placeholder="ID, title, campaign, PIC" defaultValue={sp.q || ''} />
        </div>
        <button className="btn primary" type="submit">
          Apply
        </button>
      </form>

      {view.key === 'revisi' ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Brand · Campaign</th>
                <th>Revision rounds</th>
                <th>Latest revision from</th>
                <th>Revision received</th>
                <th>Assignee</th>
                <th>Deadline</th>
                <th>Time left</th>
              </tr>
            </thead>
            <tbody>
              {revRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty">
                    No tasks in revision.
                  </td>
                </tr>
              ) : (
                revRows.map((x) => {
                  const href = `/tasks/${encodeURIComponent(x.task['Task ID'])}#komentar`;
                  return (
                    <RowLink key={x.task['Task ID']} href={href}>
                      <td className="nowrap">
                        <Link className="task-title" href={href}>
                          {taskTitle(x.task, reqById.get(x.task['Request ID']))}
                        </Link>
                        <div className="task-code">
                          {x.task['Task ID']} · {x.task.Kategori}
                        </div>
                      </td>
                      <td>
                        <div className="title">{x.task.Brand}</div>
                        <div className="subtle">{x.request?.['Campaign Name'] || '-'}</div>
                      </td>
                      <td className="nowrap">
                        <span className={x.ronde > 2 ? 'rev-warn' : ''} title={x.ronde > 2 ? 'More than 2 revision rounds' : undefined}>
                          {x.ronde} {x.ronde === 1 ? 'round' : 'rounds'}
                          {x.ronde > 2 ? ' ⚠' : ''}
                        </span>
                        {x.ronde > maxRevisi ? <div className="badge red">Over limit of {maxRevisi}</div> : null}
                      </td>
                      <td>
                        {x.dari}
                        <div className="subtle">{x.sumber === 'Brand' ? 'Brand revision' : 'Lead QC (internal)'}</div>
                      </td>
                      <td className="nowrap">{formatWaktu(x.masuk)}</td>
                      <td>{x.task.Assignee || '-'}</td>
                      <td className="nowrap">{formatTanggal(x.task.Deadline)}</td>
                      <td className="nowrap">
                        <Sisa deadline={x.task.Deadline} today={today} done={false} />
                      </td>
                    </RowLink>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <form action={bulkCekBriefAction}>
          <input type="hidden" name="back" value={backHere} />
          <BulkBar selectable={selectableCount} />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {selectableCount ? <th className="check-col" aria-label="Select" /> : null}
                  <th>Request</th>
                  <th>Submitted</th>
                  <th>Brand</th>
                  <th>Category</th>
                  <th>PIC</th>
                  <th>Traffic</th>
                  <th>Status</th>
                  <th>Deadline</th>
                  <th>Time left</th>
                  <th>Tasks</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={selectableCount ? 11 : 10} className="empty">
                      No requests in this tab.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const split = splitPlan(r, defs);
                    const nTasks = tasksBy.get(r['Request ID']) || 0;
                    return (
                      <tr key={r['Request ID']}>
                        {selectableCount ? (
                          <td className="check-col">
                            {selectable(r) ? (
                              <input type="checkbox" name="ids" value={r['Request ID']} aria-label={`Select ${r['Request ID']}`} />
                            ) : null}
                          </td>
                        ) : null}
                        <td className="task-cell">
                          <Link className="task-title" href={`/requests/${r['Request ID']}`}>
                            {r.Judul || r['Campaign Name']}
                          </Link>
                          {r.Judul ? <div className="task-campaign">{r['Campaign Name']}</div> : null}
                          <div className="task-code">
                            {r['Request ID']} <UrgentBadge urgent={r.Urgent} />
                          </div>
                        </td>
                        <td className="nowrap">{formatWaktu(r.Timestamp)}</td>
                        <td>
                          <div className="title">{r.Brand}</div>
                          <div className="subtle">{r.Grup}</div>
                        </td>
                        <td>{r.Kategori}</td>
                        <td>{r['PIC Brand']}</td>
                        <td>{r.Traffic}</td>
                        <td>
                          <StatusBadge status={r.Status} />
                        </td>
                        <td className="nowrap">{formatTanggal(r.Deadline)}</td>
                        <td className="nowrap">
                          <Sisa deadline={r.Deadline} today={today} done={r.Status === REQUEST_STATUS.SELESAI} />
                        </td>
                        <td className="nowrap">
                          {nTasks || (split.length ? '' : '-')}
                          {split.length ? (
                            <div className="subtle" title={split.map((p) => `${p.kategori}: ${p.n}`).join(', ')}>
                              {nTasks ? 'split' : `→ ${split.reduce((n, p) => n + p.n, 0) + Math.max(0, r.Kategori.split(',').filter(Boolean).length - split.length)} tasks`}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </form>
      )}
    </>
  );
}
