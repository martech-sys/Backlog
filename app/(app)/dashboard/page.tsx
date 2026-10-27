import Link from 'next/link';
import { HBars, StatusBadge, UrgentBadge } from '@/components/ui';
import { BOARD_COLORS } from '@/lib/backlog';
import { now } from '@/lib/clock';
import { computeDashboard, defaultFilters } from '@/lib/dashboard';
import { addDays, formatTanggal, sisaLabel, todayWib } from '@/lib/dates';
import { getDb, requireUser } from '@/lib/session';

export const metadata = { title: 'Dashboard' };

type SP = Promise<Record<string, string | undefined>>;

function Kpi({
  label,
  value,
  hint,
  color,
  alert,
}: {
  label: string;
  value: React.ReactNode;
  hint: React.ReactNode;
  color: string;
  alert?: boolean;
}) {
  return (
    <div className={`mcard plain kpi${alert ? ' alert' : ''}`} style={{ ['--c' as string]: color }}>
      <div className="tab">{label}</div>
      <div className="value">{value}</div>
      <div className="hint">{hint}</div>
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: SP }) {
  await requireUser();
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
  const range = presetRange[preset] || { from: sp.from || addDays(today, -29), to: sp.to || today };
  const f = defaultFilters(today, { ...range, grup: sp.grup, brand: sp.brand, divisi: sp.divisi, anggota: sp.anggota });
  const d = computeDashboard({ master: db.master, requests: db.requests, tasks: db.tasks, statusLog: db.statusLog, filters: f, now: n });

  const delta = d.kpi.requestsIn - d.kpi.requestsPrev;
  const maxLoad = Math.max(1, ...d.workload.map((w) => w.count));
  const workload = d.workload.filter((w) => w.count > 0 || !!f.divisi || !!f.anggota).slice(0, 16);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Tepat waktu, siapa yang penuh, dan di mana macetnya. Angka terisi otomatis dari tracker.</p>
        </div>
        <div className="title-box" style={{ fontSize: 14 }}>
          {formatTanggal(f.from, false)} – {formatTanggal(f.to, false)}
        </div>
      </div>

      <form className="filters">
        <div className="field">
          <label htmlFor="periode">Periode</label>
          <select id="periode" name="periode" defaultValue={preset}>
            <option value="7">7 hari terakhir</option>
            <option value="30">30 hari terakhir</option>
            <option value="90">90 hari terakhir</option>
            <option value="bulan">Bulan ini</option>
            <option value="custom">Pilih tanggal</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="from">Dari</label>
          <input id="from" type="date" name="from" defaultValue={f.from} />
        </div>
        <div className="field">
          <label htmlFor="to">Sampai</label>
          <input id="to" type="date" name="to" defaultValue={f.to} />
        </div>
        <div className="field">
          <label htmlFor="grup">Grup</label>
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
            <option value="">Semua brand</option>
            {d.options.brands.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="divisi">Divisi</label>
          <select id="divisi" name="divisi" defaultValue={f.divisi}>
            <option value="">Semua divisi</option>
            {d.options.divisi.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="anggota">Anggota</label>
          <select id="anggota" name="anggota" defaultValue={f.anggota}>
            <option value="">Semua anggota</option>
            {d.options.anggota.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        <button className="btn primary" type="submit">
          Terapkan
        </button>
        <Link className="btn" href="/dashboard">
          Reset
        </Link>
      </form>
      <p className="subtle" style={{ marginTop: -8 }}>
        Pilih &quot;Pilih tanggal&quot; agar kolom Dari/Sampai dipakai.
      </p>

      <h2 className="section-title">
        <span className="num">1</span> Ringkasan
      </h2>
      <div className="grid grid-4 stretch" style={{ paddingTop: 22, rowGap: 34 }}>
        <Kpi
          label="Request masuk"
          color={BOARD_COLORS[0]}
          value={d.kpi.requestsIn}
          hint={
            <>
              per periode ·{' '}
              <span className={delta >= 0 ? 'delta-up' : 'delta-down'}>
                {delta >= 0 ? '+' : ''}
                {delta}
              </span>{' '}
              vs periode sebelumnya
            </>
          }
        />
        <Kpi
          label="Tepat waktu"
          color={BOARD_COLORS[2]}
          value={d.kpi.onTimePct === null ? '–' : `${d.kpi.onTimePct}%`}
          hint={`${d.kpi.onTimeCount} dari ${d.kpi.doneCount} task selesai on time`}
        />
        <Kpi
          label="Rata-rata revisi"
          color={BOARD_COLORS[4]}
          value={d.kpi.avgRevisi === null ? '–' : d.kpi.avgRevisi.toFixed(1)}
          hint="ronde revisi brand per task selesai"
        />
        <Kpi
          label="Task overdue"
          color={BOARD_COLORS[1]}
          value={d.kpi.overdueNow}
          hint={`saat ini · dari ${d.kpi.activeTasks} task terbuka`}
          alert={d.kpi.overdueNow > 0}
        />
      </div>

      <h2 className="section-title">
        <span className="num">2</span> Volume, posisi & beban
      </h2>
      <div className="grid grid-2 stretch" style={{ paddingTop: 22, rowGap: 34 }}>
        <section className="mcard plain" style={{ ['--c' as string]: BOARD_COLORS[3] }}>
          <div className="tab">Request per brand</div>
          <div className="card-head">
            <p>{d.requestsPerBrand.length} brand, dipisah Menswear / Womenswear</p>
            <div className="legend" style={{ marginTop: 0 }}>
              <span>
                <i style={{ background: 'var(--bar)' }} />
                Menswear
              </span>
              <span>
                <i style={{ background: BOARD_COLORS[5] }} />
                Womenswear
              </span>
            </div>
          </div>
          <div className="bars">
            {(() => {
              const max = Math.max(1, ...d.requestsPerBrand.map((b) => b.count));
              return d.requestsPerBrand.map((b) => (
                <div className="bar-row" key={b.brand}>
                  <span className="name">{b.brand}</span>
                  <span className="bar-track">
                    <span
                      className="bar-fill"
                      style={{
                        display: 'block',
                        width: `${(b.count / max) * 100}%`,
                        background: b.grup === 'Womenswear' ? BOARD_COLORS[5] : undefined,
                      }}
                    />
                  </span>
                  <span className="num">{b.count}</span>
                </div>
              ));
            })()}
          </div>
        </section>

        <section className="mcard plain" style={{ ['--c' as string]: BOARD_COLORS[6] }}>
          <div className="tab">Posisi pekerjaan saat ini</div>
          <div className="card-head">
            <p>Jumlah request/task di tiap status</p>
            <Link href="/tracker" className="subtle">
              Buka tracker →
            </Link>
          </div>
          <HBars
            items={d.statusPosition.map((s) => ({
              label: s.status,
              value: s.count,
              tone: s.status === 'Review Brand' || s.status === 'Brief Kurang' ? 'muted' : '',
            }))}
          />
          <div className="legend">
            <span>
              <i style={{ background: 'var(--bar)' }} />
              di tim creative
            </span>
            <span>
              <i style={{ background: 'var(--bar-muted)' }} />
              menunggu brand
            </span>
          </div>
        </section>

        <section className="mcard plain" style={{ ['--c' as string]: BOARD_COLORS[8] }}>
          <div className="tab">Beban kerja per anggota</div>
          <div className="card-head">
            <p>Task aktif per orang; merah = di atas kapasitas</p>
            <Link href="/backlog" className="subtle">
              Team Backlog →
            </Link>
          </div>
          {workload.length ? (
            <>
              <div className="vbars">
                {workload.map((w) => (
                  <div className="vbar" key={w.name} title={`${w.name} (${w.divisi}): ${w.count}/${w.capacity}`}>
                    <span className="n">{w.count}</span>
                    <span className={`col${w.over ? ' danger' : ''}`} style={{ height: `${(w.count / maxLoad) * 85}%` }} />
                  </div>
                ))}
              </div>
              <div className="vbar-labels">
                {workload.map((w) => (
                  <span key={w.name} title={w.name}>
                    {w.name.split(' ')[0]}
                    {w.name.split(' ')[1] && w.name.split(' ')[1].length <= 2 ? ` ${w.name.split(' ')[1]}` : ''}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="empty">Tidak ada task aktif.</div>
          )}
        </section>

        <section className="mcard plain" style={{ ['--c' as string]: BOARD_COLORS[7] }}>
          <div className="tab">Lama waktu per tahap</div>
          <div className="card-head">
            <p>Rata-rata hari; macet di tim atau di brand?</p>
          </div>
          <HBars
            items={d.stageDurations.map((s) => ({ label: s.stage, value: s.avgDays ?? 0, tone: s.side === 'brand' ? 'muted' : '' }))}
            format={(v) => (v ? `${v.toFixed(1)} hari` : '–')}
          />
          <div className="legend">
            <span>
              <i style={{ background: 'var(--bar)' }} />
              di tim creative
            </span>
            <span>
              <i style={{ background: 'var(--bar-muted)' }} />
              menunggu brand
            </span>
          </div>
        </section>
      </div>

      <h2 className="section-title">
        <span className="num">3</span> Tindak lanjut
      </h2>
      <div className="grid grid-3 stretch" style={{ paddingTop: 22, rowGap: 34 }}>
        <section className="mcard plain span-2" style={{ ['--c' as string]: BOARD_COLORS[1] }}>
          <div className="tab">Daftar task overdue dan mepet</div>
          <div className="card-head">
            <p>Diurutkan dari sisa hari paling sedikit; dasar tindakan Traffic dan lead</p>
          </div>
          <div className="table-wrap" style={{ border: '1.5px solid var(--c)' }}>
            <table>
              <thead>
                <tr>
                  <th>ID task</th>
                  <th>Brand</th>
                  <th>Divisi</th>
                  <th>Assignee</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th>Sisa</th>
                </tr>
              </thead>
              <tbody>
                {d.watchlist.length ? (
                  d.watchlist.map((w) => (
                    <tr key={w.taskId}>
                      <td className="nowrap">
                        <Link className="title" href={`/tasks/${w.taskId}`}>
                          {w.taskId}
                        </Link>{' '}
                        <UrgentBadge urgent={w.urgent} />
                      </td>
                      <td>{w.brand}</td>
                      <td>{w.divisi}</td>
                      <td>{w.assignee || <span className="badge outline">Belum assign</span>}</td>
                      <td className="nowrap">{formatTanggal(w.deadline, false)}</td>
                      <td>
                        <StatusBadge status={w.status} />
                      </td>
                      <td className="nowrap">
                        <span className={`sisa ${w.daysLeft < 0 ? 'late' : w.daysLeft <= 1 ? 'soon' : ''}`}>{sisaLabel(w.daysLeft)}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="empty">
                      Tidak ada task overdue atau mepet. 🎉
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mcard plain" style={{ ['--c' as string]: BOARD_COLORS[9] }}>
          <div className="tab">Rata-rata revisi per brand</div>
          <div className="card-head">
            <p>Brief mana yang sering tidak jelas?</p>
          </div>
          <HBars
            items={d.revisiPerBrand.map((b) => ({ label: `${b.brand} (${b.tasks})`, value: b.avg }))}
            format={(v) => v.toFixed(1)}
            empty="Belum ada task selesai di periode ini"
          />
        </section>
      </div>
    </>
  );
}
