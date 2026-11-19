import Link from 'next/link';
import { DotNumber } from '@/components/DotNumber';
import { Flash, HBars, HealthBadge, StatusBadge, UrgentBadge } from '@/components/ui';
import { healthOf } from '@/lib/taskInfo';
import { RowLink } from '@/components/RowLink';
import { WorkloadChart } from '@/components/WorkloadChart';
import { ACTIVE_STATUSES, CUSTOM_CATEGORY, STATUS, type Status } from '@/lib/config';
import { dashQuery, drill } from '@/lib/drill';
import { canManageKategori } from '@/lib/kategoriAdmin';
import { now } from '@/lib/clock';
import { computeDashboard, defaultFilters } from '@/lib/dashboard';
import { addDays, formatTanggal, sisaLabel, todayWib } from '@/lib/dates';
import { getBadges, getDb, requireUser } from '@/lib/session';
import { MarkMenuSeen } from '@/components/MarkMenuSeen';

export const metadata = { title: 'Dashboard' };

type SP = Promise<Record<string, string | undefined>>;

function Kpi({
  label,
  value,
  hint,
  color,
  alert,
  href,
}: {
  label: string;
  value: string | number;
  hint: React.ReactNode;
  color: string;
  alert?: boolean;
  href?: string;
}) {
  const card = (
    <div className={`kpi-tile${alert ? ' alert' : ''}`} style={{ ['--c' as string]: color }}>
      <span className="pill">{label}</span>
      <div className="kpi-panel">
        <DotNumber value={value} />
        <span className="ticks" aria-hidden="true" />
      </div>
      <div className="hint">{hint}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="kpi-link" title={`${label}: click to see the list`}>
      {card}
    </Link>
  ) : (
    card
  );
}

/** Label tampilan (English) untuk tahap grafik "Average Time per Stage"; nilai filter tetap nama aslinya. */
const STAGE_LABEL: Record<string, string> = {
  'Cek brief': 'Brief check',
  'Menunggu assign': 'Waiting to assign',
  Produksi: 'Production',
  'QC lead': 'Lead QC',
  'Lengkapi brief': 'Completing brief',
  'Review brand': 'Brand review',
  Revisi: 'Revision',
  'Upload final': 'Final upload',
};

export default async function DashboardPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const mayManageKategori = canManageKategori(user);
  const sp = await searchParams;
  const db = await getDb();
  const n = now();
  const today = todayWib(n);
  const preset = sp.periode || (sp.from || sp.to ? 'custom' : '30');
  const presetRange: Record<string, { from: string; to: string }> = {
    '7': { from: addDays(today, -6), to: today },
    '30': { from: addDays(today, -29), to: today },
    '90': { from: addDays(today, -89), to: today },
    bulan: { from: today.slice(0, 8) + '01', to: today },
  };
  const range = presetRange[preset] || {
    from: sp.from || addDays(today, -29),
    to: sp.to || today,
  };
  const f = defaultFilters(today, {
    ...range,
    grup: sp.grup,
    brand: sp.brand,
    divisi: sp.divisi,
    anggota: sp.anggota,
    kategori: sp.kategori,
  });
  const d = computeDashboard({
    master: db.master,
    requests: db.requests,
    tasks: db.tasks,
    statusLog: db.statusLog,
    filters: f,
    now: n,
  });

  // Drill-down: filter dashboard ikut dibawa ke halaman tujuan.
  const dq = dashQuery({ ...sp, from: f.from, to: f.to, periode: preset });
  const scope = { grup: f.grup, brand: f.brand, divisi: f.divisi, kategori: f.kategori };
  const taskScope = { ...scope, anggota: f.anggota };
  // Angka request di dashboard tidak dipengaruhi filter divisi/anggota, jadi drill-down-nya juga tidak.
  const reqHref = (extra: Record<string, string>) =>
    drill(
      '/requests',
      {
        view: 'semua',
        grup: f.grup,
        brand: f.brand,
        kategori: f.kategori,
        from: f.from,
        to: f.to,
        ...extra,
      },
      dq,
    );
  const trackerHref = (extra: Record<string, string>) => drill('/tracker', { view: 'semua', ...taskScope, ...extra }, dq);
  const statusHref = (status: string) =>
    status === STATUS.BARU
      ? drill('/requests', { view: 'cek', grup: f.grup, brand: f.brand, kategori: f.kategori }, dq)
      : status === STATUS.BRIEF_KURANG
        ? drill('/requests', { view: 'kurang', grup: f.grup, brand: f.brand, kategori: f.kategori }, dq)
        : trackerHref({ status });
  const stageHref = (stage: string) =>
    stage === 'Cek brief'
      ? drill('/requests', { view: 'cek', grup: f.grup, brand: f.brand, kategori: f.kategori }, dq)
      : stage === 'Lengkapi brief'
        ? drill('/requests', { view: 'kurang', grup: f.grup, brand: f.brand, kategori: f.kategori }, dq)
        : trackerHref({ view: 'aktif', tahap: stage, sort: 'lama' });
  const memberTasks = (name: string) =>
    db.tasks
      .filter(
        (t) =>
          t.Assignee === name &&
          ACTIVE_STATUSES.includes(t.Status as Status) &&
          (!f.grup || t.Grup === f.grup) &&
          (!f.brand || t.Brand === f.brand) &&
          (!f.divisi || t.Divisi === f.divisi) &&
          (!f.kategori || t.Kategori === f.kategori),
      )
      .sort((a, b) => (a.Deadline || '9').localeCompare(b.Deadline || '9'))
      .map((t) => ({
        id: t['Task ID'],
        brand: t.Brand,
        status: t.Status,
        deadline: t.Deadline ? formatTanggal(t.Deadline, false) : '',
      }));

  const delta = d.kpi.requestsIn - d.kpi.requestsPrev;
  const maxLoad = Math.max(1, ...d.workload.map((w) => w.count));
  const workload = d.workload.filter((w) => w.count > 0 || !!f.divisi || !!f.anggota).slice(0, 16);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>On-time delivery, who is at capacity, and where work gets stuck. Numbers fill in automatically from the tracker.</p>
        </div>
        <div className="title-box" style={{ fontSize: 14 }}>
          {formatTanggal(f.from, false)} – {formatTanggal(f.to, false)}
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <MarkMenuSeen menu="dashboard" pending={(await getBadges()).dashboard} />

      <form className="filters">
        <div className="field">
          <label htmlFor="periode">Period</label>
          <select id="periode" name="periode" defaultValue={preset}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="bulan">This month</option>
            <option value="custom">Pick dates</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="from">From</label>
          <input id="from" type="date" name="from" defaultValue={f.from} />
        </div>
        <div className="field">
          <label htmlFor="to">To</label>
          <input id="to" type="date" name="to" defaultValue={f.to} />
        </div>
        <div className="field">
          <label htmlFor="grup">Group</label>
          <select id="grup" name="grup" defaultValue={f.grup}>
            <option value="">Menswear & Womenswear</option>
            {d.options.grups.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="brand">Brand</label>
          <select id="brand" name="brand" defaultValue={f.brand}>
            <option value="">All brands</option>
            {d.options.brands.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="divisi">Division</label>
          <select id="divisi" name="divisi" defaultValue={f.divisi}>
            <option value="">All divisions</option>
            {d.options.divisi.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="kategori">Category</label>
          <select id="kategori" name="kategori" defaultValue={f.kategori}>
            <option value="">All categories</option>
            {d.options.kategori.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="anggota">Member</label>
          <select id="anggota" name="anggota" defaultValue={f.anggota}>
            <option value="">All members</option>
            {d.options.anggota.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        <button className="btn primary" type="submit">
          Apply
        </button>
        <Link className="btn" href="/dashboard">
          Reset
        </Link>
      </form>
      <p className="subtle" style={{ marginTop: -8 }}>
        Choose &quot;Pick dates&quot; to use the From/To fields. Every number, bar, and card is clickable and opens the matching list with
        these filters applied.
      </p>

      <h2 className="section-title">
        <span className="num">1</span> Summary
      </h2>
      <div className="kpi-grid">
        <Kpi
          label="Incoming Requests"
          color="#f0811c"
          href={reqHref({})}
          value={d.kpi.requestsIn}
          hint={
            <>
              this period ·{' '}
              <span className={delta >= 0 ? 'delta-up' : 'delta-down'}>
                {delta >= 0 ? '+' : ''}
                {delta}
              </span>{' '}
              vs previous period
            </>
          }
        />
        <Kpi
          label="Current Task"
          color="#0f9f9a"
          href={trackerHref({ view: 'aktif' })}
          value={d.kpi.activeTasks}
          hint="active tasks not yet Final (incl. revisions & overdue)"
        />
        <Kpi
          label="On-time Completion"
          color="#2ea043"
          href={trackerHref({ view: 'selesai', from: f.from, to: f.to })}
          value={d.kpi.onTimePct === null ? '–' : `${d.kpi.onTimePct}%`}
          hint={`${d.kpi.onTimeCount} of ${d.kpi.doneCount} completed tasks on time`}
        />
        <Kpi
          label="Average Revisions"
          color="#7b4fd6"
          href={trackerHref({
            view: 'selesai',
            from: f.from,
            to: f.to,
            sort: 'revisi',
          })}
          value={d.kpi.avgRevisi === null ? '–' : d.kpi.avgRevisi.toFixed(1)}
          hint="brand revision rounds per completed task"
        />
        <Kpi
          label="Tasks Completed"
          color="#2b88d8"
          href={trackerHref({ view: 'selesai', from: f.from, to: f.to })}
          value={d.kpi.doneCount}
          hint="tasks that reached Final this period"
        />
        <Kpi
          label="Overdue Tasks"
          color="#e0383e"
          href={trackerHref({ view: 'overdue' })}
          value={d.kpi.overdueNow}
          hint={`right now · of ${d.kpi.activeTasks} open tasks`}
          alert={d.kpi.overdueNow > 0}
        />
      </div>

      <section className="mcard plain health-card" style={{ marginTop: 18 }}>
        <div className="card-title">
          <h3>Creative Output Task Health</h3>
          <Link href={trackerHref({ view: 'aktif' })} className="subtle">
            Open tracker →
          </Link>
        </div>
        <div className="health-grid">
          {d.health.map((h) => (
            <Link key={h.key} href={trackerHref({ view: 'aktif', health: h.key })} className={`health-tile ${h.key}`}>
              <HealthBadge health={healthOf(h.key)} />
              <span className="health-count">{h.count}</span>
              <span className="health-value">{h.value}</span>
              <span className="subtle">{h.rule}</span>
            </Link>
          ))}
        </div>
      </section>

      <h2 className="section-title">
        <span className="num">2</span> Volume, Position & Workload
      </h2>
      <div className="grid grid-2 stretch">
        <section className="mcard plain">
          <div className="card-title">
            <h3>Active Tasks per Brand</h3>
            <div className="legend" style={{ marginTop: 0 }}>
              <span>
                <i style={{ background: 'var(--bar)' }} />
                Menswear
              </span>
              <span>
                <i style={{ background: 'var(--bar-women)' }} />
                Womenswear
              </span>
            </div>
          </div>
          <p className="card-sub">{d.activeTasksPerBrand.length} brands · only tasks not yet Final are counted</p>
          <div className="bars">
            {(() => {
              const max = Math.max(1, ...d.activeTasksPerBrand.map((b) => b.count));
              return d.activeTasksPerBrand.map((b) => (
                <Link
                  className="bar-row"
                  key={b.brand}
                  href={trackerHref({ view: 'aktif', brand: b.brand })}
                  title={`${b.brand}: ${b.count} active tasks · click to see them`}
                >
                  <span className="name">{b.brand}</span>
                  <span className="bar-track">
                    <span
                      className="bar-fill"
                      style={{
                        display: 'block',
                        width: `${(b.count / max) * 100}%`,
                        background: b.grup === 'Womenswear' ? 'var(--bar-women)' : undefined,
                      }}
                    />
                  </span>
                  <span className="num">{b.count}</span>
                </Link>
              ));
            })()}
          </div>
        </section>

        <section className="mcard plain">
          <div className="card-title">
            <h3>Current Work Position</h3>
            <Link href={trackerHref({ view: 'aktif' })} className="btn small">
              Open tracker →
            </Link>
          </div>
          <p className="card-sub">Requests/tasks in each status</p>
          <HBars
            items={d.statusPosition.map((s) => ({
              label: s.status,
              value: s.count,
              tone: s.status === 'Review Brand' || s.status === 'Brief Kurang' ? 'muted' : '',
              href: statusHref(s.status),
            }))}
          />
          <div className="legend">
            <span>
              <i style={{ background: 'var(--bar)' }} />
              with creative team
            </span>
            <span>
              <i style={{ background: 'var(--bar-muted)' }} />
              waiting for brand
            </span>
          </div>
        </section>

        <section className="mcard plain">
          <div className="card-title">
            <h3>Workload by Team Member</h3>
            <Link href="/backlog" className="btn small">
              Team Backlog →
            </Link>
          </div>
          <p className="card-sub">Active tasks per person; red = over capacity</p>
          {workload.length ? (
            <WorkloadChart
              items={workload.map((w) => ({
                ...w,
                tasks: w.count ? memberTasks(w.name) : [],
                href: trackerHref({ view: 'aktif', anggota: w.name }),
              }))}
              max={maxLoad}
            />
          ) : (
            <div className="empty">No active tasks.</div>
          )}
        </section>

        <section className="mcard plain">
          <div className="card-title">
            <h3>Average Time per Stage</h3>
          </div>
          <p className="card-sub">Average days; stuck in the team or with the brand?</p>
          <HBars
            items={d.stageDurations.map((s) => ({
              label: STAGE_LABEL[s.stage] || s.stage,
              value: s.avgDays ?? 0,
              tone: s.side === 'brand' ? 'muted' : '',
              href: stageHref(s.stage),
            }))}
            format={(v) => (v ? `${v.toFixed(1)} days` : '–')}
          />
          <div className="legend">
            <span>
              <i style={{ background: 'var(--bar)' }} />
              with creative team
            </span>
            <span>
              <i style={{ background: 'var(--bar-muted)' }} />
              waiting for brand
            </span>
          </div>
        </section>
      </div>

      <h2 className="section-title">
        <span className="num">3</span> Follow-up
      </h2>
      <div className="grid grid-3 stretch">
        <section className="mcard plain span-2">
          <div className="card-title">
            <h3>Overdue & At-Risk Tasks</h3>
          </div>
          <p className="card-sub">Sorted by fewest days left; the basis for Traffic and lead follow-up</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Brand</th>
                  <th>Division</th>
                  <th>Assignee</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th>Health</th>
                </tr>
              </thead>
              <tbody>
                {d.watchlist.length ? (
                  d.watchlist.map((w) => (
                    <RowLink key={w.taskId} href={`/tasks/${encodeURIComponent(w.taskId)}`}>
                      <td>
                        <Link className="task-title" href={`/tasks/${w.taskId}`}>
                          {w.title}
                        </Link>
                        <div className="task-code">
                          {w.taskId} <UrgentBadge urgent={w.urgent} />
                        </div>
                      </td>
                      <td>{w.brand}</td>
                      <td>{w.divisi}</td>
                      <td>{w.assignee || <span className="badge outline">Unassigned</span>}</td>
                      <td className="nowrap">
                        {formatTanggal(w.deadline, false)}
                        <div className={`sisa ${w.daysLeft < 0 ? 'late' : w.daysLeft <= 1 ? 'soon' : ''}`}>{sisaLabel(w.daysLeft)}</div>
                      </td>
                      <td>
                        <StatusBadge status={w.status} />
                      </td>
                      <td>{w.health ? <HealthBadge health={healthOf(w.health)} /> : null}</td>
                    </RowLink>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="empty">
                      No overdue or at-risk tasks. 🎉
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mcard plain">
          <div className="card-title">
            <h3>Average Revisions per Brand</h3>
          </div>
          <p className="card-sub">Which briefs are often unclear?</p>
          <HBars
            items={d.revisiPerBrand.map((b) => ({
              label: `${b.brand} (${b.tasks})`,
              value: b.avg,
              href: trackerHref({
                view: 'selesai',
                brand: b.brand,
                from: f.from,
                to: f.to,
                sort: 'revisi',
              }),
            }))}
            format={(v) => v.toFixed(1)}
            empty="No completed tasks in this period"
          />
        </section>

        <section className="mcard plain span-3">
          <div className="card-title">
            <h3>Custom Work</h3>
          </div>
          <p className="card-sub">
            &quot;Lainnya (custom)&quot; requests by type. Types that show up more than 3 times in a month are worth turning into a new
            category.
          </p>
          <HBars
            items={d.customTypes.map((c) => ({
              label: `${c.jenis === '(belum diatur)' ? '(not set yet)' : c.jenis}${c.candidate ? ' ★' : ''}`,
              value: c.count,
              tone: c.candidate ? 'danger' : '',
              href: trackerHref({
                view: 'semua',
                kategori: CUSTOM_CATEGORY,
                q: c.jenis === '(belum diatur)' ? '' : c.jenis,
              }),
            }))}
            empty="No custom requests in this period."
          />
          {d.customTypes.some((c) => c.candidate) ? (
            <div className="subtle" style={{ marginBottom: 0 }}>
              ★ New category candidates (more than 3 times in a month):
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {d.customTypes
                  .filter((c) => c.candidate)
                  .map((c) => (
                    <li key={c.jenis}>
                      {c.jenis} (max {c.maxPerMonth}x/month)
                      {mayManageKategori ? (
                        <>
                          {' · '}
                          <Link href={`/admin/kategori?baru=${encodeURIComponent(c.jenis)}#tambah`}>Make it a category →</Link>
                        </>
                      ) : null}
                    </li>
                  ))}
              </ul>
              {mayManageKategori ? null : <p style={{ margin: '6px 0 0' }}>Ask an Admin to turn it into a category in Manage categories.</p>}
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
