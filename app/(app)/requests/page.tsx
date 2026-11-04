import Link from 'next/link';
import { REQUEST_STATUS } from '@/lib/config';
import { now } from '@/lib/clock';
import { formatTanggal, formatWaktu, todayWib } from '@/lib/dates';
import { getDb, requireUser } from '@/lib/session';
import { Flash, Sisa, StatusBadge, UrgentBadge } from '@/components/ui';
import { can } from '@/lib/workflow';

export const metadata = { title: 'Request' };

type SP = Promise<Record<string, string | undefined>>;

const VIEWS = [
  { key: 'cek', label: 'Menunggu cek brief', match: (s: string) => s === REQUEST_STATUS.BARU },
  { key: 'kurang', label: 'Brief kurang', match: (s: string) => s === REQUEST_STATUS.BRIEF_KURANG },
  { key: 'proses', label: 'Diproses', match: (s: string) => s === REQUEST_STATUS.DIPROSES },
  { key: 'selesai', label: 'Selesai', match: (s: string) => s === REQUEST_STATUS.SELESAI },
  { key: 'semua', label: 'Semua', match: () => true },
] as const;

export default async function RequestsPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const db = await getDb();
  const today = todayWib(now());
  const view = VIEWS.find((v) => v.key === sp.view) || (user.roles.includes('pic') && !user.roles.includes('traffic') ? VIEWS[4] : VIEWS[0]);
  const mine = sp.mine === '1' || (user.roles.includes('pic') && !sp.mine && !user.roles.some((r) => ['admin', 'traffic', 'head', 'hocp'].includes(r)));
  const q = (sp.q || '').toLowerCase();

  const base = db.requests.filter(
    (r) =>
      (!sp.grup || r.Grup === sp.grup) &&
      (!sp.brand || r.Brand === sp.brand) &&
      (!mine || r['PIC Brand'] === user.name || r['Email Requestor'] === user.email) &&
      (!q || `${r['Request ID']} ${r.Brand} ${r['Campaign Name']} ${r['PIC Brand']} ${r.Kategori}`.toLowerCase().includes(q)),
  );
  const rows = base.filter((r) => view.match(r.Status)).sort((a, b) => b.Timestamp.localeCompare(a.Timestamp));
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
            <span className="count">{base.filter((r) => v.match(r.Status)).length}</span>
          </Link>
        ))}
      </div>

      <form className="filters">
        <input type="hidden" name="view" value={view.key} />
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
    </>
  );
}
