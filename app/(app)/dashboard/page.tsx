import Link from 'next/link';
import { Flash, HBars, StatusBadge, UrgentBadge } from '@/components/ui';
import { RowLink } from '@/components/RowLink';
import { WorkloadChart } from '@/components/WorkloadChart';
import { ACTIVE_STATUSES, CUSTOM_CATEGORY, STATUS, type Status } from '@/lib/config';
import { dashQuery, drill } from '@/lib/drill';
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
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint: React.ReactNode;
  color: string;
  alert?: boolean;
  href?: string;
}) {
  const card = (
    <div className={`mcard plain kpi${alert ? ' alert' : ''}`} style={{ ['--c' as string]: color }}>
      <div className="tab">{label}</div>
      <div className="value">{value}</div>
      <div className="hint">{hint}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="kpi-link" title={`${label}: klik untuk lihat daftarnya`}>
      {card}
    </Link>
  ) : (
    card
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
          <p>Tepat waktu, siapa yang penuh, dan di mana macetnya. Angka terisi otomatis dari tracker.</p>
        </div>
        <div className="title-box" style={{ fontSize: 14 }}>
          {formatTanggal(f.from, false)} – {formatTanggal(f.to, false)}
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

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
          <label htmlFor="kategori">Kategori</label>
          <select id="kategori" name="kategori" defaultValue={f.kategori}>
            <option value="">Semua kategori</option>
            {d.options.kategori.map((x) => (
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
        Pilih &quot;Pilih tanggal&quot; agar kolom Dari/Sampai dipakai. Semua angka, batang, dan kartu bisa diklik untuk melihat daftarnya;
        filter di atas ikut terbawa.
      </p>

      <h2 className="section-title">
        <span className="num">1</span> Ringkasan
      </h2>
      <div className="grid grid-5 stretch" style={{ paddingTop: 22, rowGap: 34 }}>
        <Kpi
          label="Request masuk"
          color={BOARD_COLORS[0]}
          href={reqHref({})}
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
          href={trackerHref({ view: 'selesai', from: f.from, to: f.to })}
          value={d.kpi.onTimePct === null ? '–' : `${d.kpi.onTimePct}%`}
          hint={`${d.kpi.onTimeCount} dari ${d.kpi.doneCount} task selesai on time`}
        />
        <Kpi
          label="Rata-rata revisi"
          color={BOARD_COLORS[4]}
          href={trackerHref({
            view: 'selesai',
            from: f.from,
            to: f.to,
            sort: 'revisi',
          })}
          value={d.kpi.avgRevisi === null ? '–' : d.kpi.avgRevisi.toFixed(1)}
          hint="ronde revisi brand per task selesai"
        />
        <Kpi
          label="Task selesai"
          color={BOARD_COLORS[3]}
          href={trackerHref({ view: 'selesai', from: f.from, to: f.to })}
          value={d.kpi.doneCount}
          hint="task mencapai Final di periode ini"
        />
        <Kpi
          label="Task overdue"
          color={BOARD_COLORS[1]}
          href={trackerHref({ view: 'overdue' })}
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
                <Link
                  className="bar-row"
                  key={b.brand}
                  href={reqHref({ brand: b.brand })}
                  title={`${b.brand}: ${b.count} request · klik untuk lihat`}
                >
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
                </Link>
              ));
            })()}
          </div>
        </section>

        <section className="mcard plain" style={{ ['--c' as string]: BOARD_COLORS[6] }}>
          <div className="tab">Posisi pekerjaan saat ini</div>
          <div className="card-head">
            <p>Jumlah request/task di tiap status</p>
            <Link href={trackerHref({ view: 'aktif' })} className="subtle">
              Buka tracker →
            </Link>
          </div>
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
              <WorkloadChart
                items={workload.map((w) => ({
                  ...w,
                  tasks: w.count ? memberTasks(w.name) : [],
                  href: trackerHref({ view: 'aktif', anggota: w.name }),
                }))}
                max={maxLoad}
              />
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
            items={d.stageDurations.map((s) => ({
              label: s.stage,
              value: s.avgDays ?? 0,
              tone: s.side === 'brand' ? 'muted' : '',
              href: stageHref(s.stage),
            }))}
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
                    <RowLink key={w.taskId} href={`/tasks/${encodeURIComponent(w.taskId)}`}>
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
                    </RowLink>
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
            empty="Belum ada task selesai di periode ini"
          />
        </section>

        <section className="mcard plain span-3" style={{ ['--c' as string]: BOARD_COLORS[5] }}>
          <div className="tab">Pekerjaan custom</div>
          <div className="card-head">
            <p>
              Request kategori &quot;Lainnya (custom)&quot; per jenis. Jenis yang muncul lebih dari 3x dalam sebulan layak dijadikan
              kategori baru.
            </p>
          </div>
          <HBars
            items={d.customTypes.map((c) => ({
              label: `${c.jenis}${c.candidate ? ' ★' : ''}`,
              value: c.count,
              tone: c.candidate ? 'danger' : '',
              href: trackerHref({
                view: 'semua',
                kategori: CUSTOM_CATEGORY,
                q: c.jenis === '(belum diatur)' ? '' : c.jenis,
              }),
            }))}
            empty="Tidak ada request custom di periode ini."
          />
          {d.customTypes.some((c) => c.candidate) ? (
            <p className="subtle" style={{ marginBottom: 0 }}>
              ★ Kandidat kategori baru:{' '}
              {d.customTypes
                .filter((c) => c.candidate)
                .map((c) => `${c.jenis} (maks. ${c.maxPerMonth}x/bulan)`)
                .join(', ')}
              . Tambahkan ke sheet Master_Kategori bila disetujui.
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}
