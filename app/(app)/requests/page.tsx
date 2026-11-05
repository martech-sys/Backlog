import Link from 'next/link';
import { FilterChips } from '@/components/FilterChips';
import { RowLink } from '@/components/RowLink';
import { CATEGORIES, REQUEST_STATUS, type RequestRow } from '@/lib/config';
import { inPeriod } from '@/lib/drill';
import { revisionRows } from '@/lib/revisi';
import { now } from '@/lib/clock';
import { formatTanggal, formatWaktu, todayWib } from '@/lib/dates';
import { getDb, requireUser } from '@/lib/session';
import { Flash, Sisa, StatusBadge, UrgentBadge } from '@/components/ui';
import { can } from '@/lib/workflow';

export const metadata = { title: 'Request' };

type SP = Promise<Record<string, string | undefined>>;

const VIEWS = [
  { key: 'cek', label: 'Menunggu cek brief' },
  { key: 'kurang', label: 'Brief kurang' },
  { key: 'proses', label: 'Diproses' },
  { key: 'revisi', label: 'Revisi' },
  { key: 'selesai', label: 'Selesai' },
  { key: 'semua', label: 'Semua' },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];

const FILTER_LABELS: Record<string, string> = {
  grup: 'Grup',
  brand: 'Brand',
  kategori: 'Kategori',
  divisi: 'Divisi',
  from: 'Periode',
  q: 'Cari',
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
      (!q || `${r['Request ID']} ${r.Brand} ${r['Campaign Name']} ${r['PIC Brand']} ${r.Kategori}`.toLowerCase().includes(q)),
  );
  const rows = base.filter((r) => match(view.key, r)).sort((a, b) => b.Timestamp.localeCompare(a.Timestamp));
  const baseIds = new Set(base.map((r) => r['Request ID']));
  const revRows = revisi.filter((x) => baseIds.has(x.task['Request ID']) && (!sp.divisi || x.task.Divisi === sp.divisi));
  const maxRevisi = db.master.config.maxRevisi;
  const tasksBy = new Map<string, number>();
  for (const t of db.tasks) tasksBy.set(t['Request ID'], (tasksBy.get(t['Request ID']) || 0) + 1);
  const keep = (patch: Record<string, string>) =>
    `/requests?${new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([k, v]) => v && k !== 'ok' && k !== 'err') as [string, string][])}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Request</h1>
          <p>Semua permintaan konten dari PIC brand, dari pengajuan sampai selesai.</p>
        </div>
        {can.submitRequest(user) ? (
          <Link className="btn primary" href="/requests/new">
            + Request baru
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
            {db.master.brands.map((b) => (
              <option key={b.name}>{b.name}</option>
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
          <label htmlFor="mine">Pengaju</label>
          <select id="mine" name="mine" defaultValue={mine ? '1' : '0'}>
            <option value="0">Semua</option>
            <option value="1">Request saya</option>
          </select>
        </div>
        <div className="field wide">
          <label htmlFor="q">Cari</label>
          <input id="q" type="search" name="q" placeholder="ID, campaign, PIC" defaultValue={sp.q || ''} />
        </div>
        <button className="btn primary" type="submit">
          Terapkan
        </button>
      </form>

      {view.key === 'revisi' ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Brand · Campaign</th>
                <th>Ronde revisi</th>
                <th>Revisi terakhir dari</th>
                <th>Tanggal revisi masuk</th>
                <th>Assignee</th>
                <th>Deadline</th>
                <th>Sisa</th>
              </tr>
            </thead>
            <tbody>
              {revRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty">
                    Tidak ada task yang sedang direvisi.
                  </td>
                </tr>
              ) : (
                revRows.map((x) => {
                  const href = `/tasks/${encodeURIComponent(x.task['Task ID'])}#komentar`;
                  return (
                    <RowLink key={x.task['Task ID']} href={href}>
                      <td className="nowrap">
                        <Link className="title" href={href}>
                          {x.task['Task ID']}
                        </Link>
                        <div className="subtle">{x.task.Kategori}</div>
                      </td>
                      <td>
                        <div className="title">{x.task.Brand}</div>
                        <div className="subtle">{x.request?.['Campaign Name'] || '-'}</div>
                      </td>
                      <td className="nowrap">
                        <span className={x.ronde > 2 ? 'rev-warn' : ''} title={x.ronde > 2 ? 'Lebih dari 2 ronde revisi' : undefined}>
                          {x.ronde} ronde{x.ronde > 2 ? ' ⚠' : ''}
                        </span>
                        {x.ronde > maxRevisi ? <div className="badge red">Lewat batas {maxRevisi}</div> : null}
                      </td>
                      <td>
                        {x.dari}
                        <div className="subtle">{x.sumber === 'Brand' ? 'Revisi brand' : 'QC lead (internal)'}</div>
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
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Masuk</th>
                <th>Brand · Campaign</th>
                <th>Kategori</th>
                <th>PIC</th>
                <th>Traffic</th>
                <th>Status</th>
                <th>Deadline</th>
                <th>Sisa</th>
                <th>Task</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="empty">
                    Tidak ada request di tab ini.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r['Request ID']}>
                    <td className="nowrap">
                      <Link className="title" href={`/requests/${r['Request ID']}`}>
                        {r['Request ID']}
                      </Link>
                      <div>
                        <UrgentBadge urgent={r.Urgent} />
                      </div>
                    </td>
                    <td className="nowrap">{formatWaktu(r.Timestamp)}</td>
                    <td>
                      <div className="title">{r.Brand}</div>
                      <div className="subtle">{r['Campaign Name']}</div>
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
                    <td>{tasksBy.get(r['Request ID']) || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
