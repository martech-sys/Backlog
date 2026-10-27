import Link from 'next/link';
import { Flash } from '@/components/ui';
import { BOARD_COLORS, buildBoards, LANES, type BoardCard, type GroupBy, type Sticky } from '@/lib/backlog';
import { now } from '@/lib/clock';
import { formatTanggal, formatWaktu, sisaLabel, todayWib } from '@/lib/dates';
import { getDb, requireUser } from '@/lib/session';

export const metadata = { title: 'Team Backlog' };

type SP = Promise<Record<string, string | undefined>>;

function StickyNote({ s, tone }: { s: Sticky; tone?: string }) {
  const cls = s.daysLeft < 0 && tone !== 'done' ? 'late' : tone === 'done' ? 'done' : tone === 'hold' ? 'hold' : s.priority === 'high' ? 'high' : '';
  return (
    <Link
      href={`/tasks/${s.taskId}`}
      className={`sticky ${cls}`}
      title={`${s.taskId}\n${s.brand} · ${s.kategori}${s.subJenis ? ` (${s.subJenis})` : ''}\nStatus: ${s.status}\nDeadline: ${formatTanggal(s.deadline)} (${sisaLabel(s.daysLeft)})${s.revisi ? `\nRevisi: ${s.revisi} ronde` : ''}`}
    >
      <b>{s.brand}</b>
      <span>{s.kategori}</span>
      <span>{tone === 'done' ? 'Final ✓' : sisaLabel(s.daysLeft)}</span>
    </Link>
  );
}

function SplitLane({ items }: { items: Sticky[] }) {
  const cols: { key: Sticky['priority']; label: string }[] = [
    { key: 'low', label: 'Low' },
    { key: 'med', label: 'Med' },
    { key: 'high', label: 'High' },
  ];
  return (
    <div className="lane-box split">
      {cols.map((c) => (
        <div className="sub" key={c.key}>
          <div className="sub-h">{c.label}</div>
          {items
            .filter((s) => s.priority === c.key)
            .map((s) => (
              <StickyNote key={s.taskId} s={s} />
            ))}
        </div>
      ))}
    </div>
  );
}

function Board({ card, groupBy }: { card: BoardCard; groupBy: GroupBy }) {
  const pct = Math.min(100, Math.round((card.load / Math.max(card.capacity, 1)) * 100));
  const filterHref =
    groupBy === 'anggota' && !card.key.startsWith('Belum assign')
      ? `/tracker?anggota=${encodeURIComponent(card.key)}`
      : groupBy === 'brand'
        ? `/tracker?brand=${encodeURIComponent(card.key)}`
        : groupBy === 'divisi'
          ? `/tracker?divisi=${encodeURIComponent(card.key)}`
          : '/tracker?status=Siap+Assign';
  return (
    <section className="mcard" style={{ ['--c' as string]: card.color }} aria-label={card.title}>
      <div className="tab">{card.title}</div>
      <div className="mcard-head">
        <div className="avatar" aria-hidden>
          {card.initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="namebar">
            <Link href={filterHref}>{card.title}</Link>
            <small>{card.subtitle}</small>
          </div>
          <div className="head-boxes">
            <div className="head-box">
              <div className="label">Bulan ini</div>
              <div className="box">
                <div className="stat-line">
                  Task aktif <b>{card.stats.active}</b>
                </div>
                <div className="stat-line">
                  Selesai <b>{card.stats.doneMonth}</b>
                </div>
                <div className="stat-line">
                  Tepat waktu <b>{card.stats.onTimePct === null ? '-' : `${card.stats.onTimePct}%`}</b>
                </div>
              </div>
            </div>
            <div className="head-box">
              <div className="label">Update terbaru</div>
              <div className="box">
                {card.updates.length ? (
                  <ul>
                    {card.updates.map((u, i) => (
                      <li key={i} title={`${u.ts} · ${u.text}`}>
                        <span className="subtle">{formatWaktu(u.ts)}</span> {u.text}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="subtle">Belum ada aktivitas</span>
                )}
              </div>
            </div>
          </div>
          <div className="energy" title={`Beban ${card.load} dari kapasitas ${card.capacity} task aktif`}>
            <div className="track">
              <span className="pin" style={{ left: `${pct}%` }} />
            </div>
            <div className="scale">
              <span>0%</span>
              <span>
                Beban <b>{card.load}</b>/{card.capacity}
              </span>
              <span>100%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="lanes">
        {LANES.map((lane) => {
          const items = card.lanes[lane.key];
          return (
            <div key={lane.key}>
              <div className="lane-title" title={lane.hint}>
                {lane.label}
                {items.length ? <span className="c">{items.length}</span> : null}
              </div>
              {lane.key === 'todo' || lane.key === 'ongoing' ? (
                <SplitLane items={items} />
              ) : (
                <div className={`lane-box ${lane.key === 'blocker' ? 'blocker' : ''}`}>
                  {items.map((s) => (
                    <StickyNote key={s.taskId} s={s} tone={lane.key === 'done' ? 'done' : lane.key === 'onHold' ? 'hold' : undefined} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function BacklogPage({ searchParams }: { searchParams: SP }) {
  await requireUser();
  const sp = await searchParams;
  const db = await getDb();
  const today = todayWib(now());
  const groupBy: GroupBy = sp.by === 'brand' || sp.by === 'divisi' ? sp.by : 'anggota';
  const boards = buildBoards({
    master: db.master,
    tasks: db.tasks,
    statusLog: db.statusLog,
    today,
    groupBy,
    grup: sp.grup,
    divisi: sp.divisi,
    q: sp.q,
  });
  const hideEmpty = sp.kosong !== '1';
  const shown = hideEmpty ? boards.filter((b) => Object.values(b.lanes).some((l) => l.length) || b.load > 0) : boards;
  const totals = Object.fromEntries(LANES.map((l) => [l.key, boards.reduce((s, b) => s + b.lanes[l.key].length, 0)]));
  const divisiOptions = [...new Set(db.master.kategori.map((k) => k.divisi))];
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams(
      Object.entries({ ...sp, ...patch }).filter(([k, v]) => v && k !== 'ok' && k !== 'err') as [string, string][],
    );
    return `/backlog?${p}`;
  };

  return (
    <div className="board-layout">
      <aside className="board-side">
        <div className="frame side-block">
          <h1 style={{ fontSize: 20, marginBottom: 6 }}>Team Backlog</h1>
          <p>Gambaran prioritas tim creative. Diperbarui otomatis dari tracker setiap ada perubahan status.</p>
        </div>
        <div className="frame side-block">
          <h3 style={{ background: BOARD_COLORS[8] }}>Kolom</h3>
          <ul>
            {LANES.map((l, i) => (
              <li key={l.key}>
                <span className="dot" style={{ background: BOARD_COLORS[i] }}>
                  {i + 1}
                </span>
                <span>
                  <b>{l.label}</b> ({totals[l.key]}): {l.hint}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="frame side-block">
          <h3 style={{ background: BOARD_COLORS[2] }}>Prioritas</h3>
          <ul>
            <li>
              <b>High</b>: URGENT atau deadline ≤ 1 hari
            </li>
            <li>
              <b>Med</b>: deadline 2–3 hari lagi
            </li>
            <li>
              <b>Low</b>: deadline &gt; 3 hari
            </li>
          </ul>
        </div>
        <div className="frame side-block">
          <h3 style={{ background: BOARD_COLORS[3] }}>Warna sticky</h3>
          <div className="board-legend" style={{ display: 'grid', gap: 6 }}>
            <span>
              <i style={{ background: '#fff2a8' }} />
              Normal
            </span>
            <span>
              <i style={{ background: '#ffd9b8' }} />
              High
            </span>
            <span>
              <i style={{ background: '#dfe9ff' }} />
              Menunggu QC / brand
            </span>
            <span>
              <i style={{ background: '#ffc9c9' }} />
              Lewat deadline
            </span>
            <span>
              <i style={{ background: '#d6f2c9' }} />
              Final
            </span>
          </div>
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            <span className="num">1</span> Review Backlog
            <span className="hint">· {formatTanggal(today)}</span>
          </h2>
          <div className="title-box">Creative Team · {sp.grup || 'Menswear & Womenswear'}</div>
        </div>

        <div style={{ marginTop: 12 }}>
          <Flash ok={sp.ok} err={sp.err} />
        </div>
        <form className="filters" style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="by">Kelompokkan</label>
            <select id="by" name="by" defaultValue={groupBy}>
              <option value="anggota">Per anggota</option>
              <option value="brand">Per brand</option>
              <option value="divisi">Per divisi</option>
            </select>
          </div>
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
            <label htmlFor="divisi">Divisi</label>
            <select id="divisi" name="divisi" defaultValue={sp.divisi || ''}>
              <option value="">Semua</option>
              {divisiOptions.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="field wide">
            <label htmlFor="q">Cari</label>
            <input id="q" type="search" name="q" placeholder="ID, brand, kategori, nama" defaultValue={sp.q || ''} />
          </div>
          <div className="field" style={{ flex: '0 0 auto', minWidth: 0 }}>
            <label htmlFor="kosong">Papan kosong</label>
            <select id="kosong" name="kosong" defaultValue={sp.kosong || ''}>
              <option value="">Sembunyikan</option>
              <option value="1">Tampilkan</option>
            </select>
          </div>
          <button className="btn primary" type="submit">
            Terapkan
          </button>
          {Object.keys(sp).length ? (
            <Link className="btn" href="/backlog">
              Reset
            </Link>
          ) : null}
        </form>

        {shown.length ? (
          <div className="boards">
            {shown.map((b) => (
              <Board key={b.key} card={b} groupBy={groupBy} />
            ))}
          </div>
        ) : (
          <div className="frame empty">
            Tidak ada pekerjaan yang cocok dengan filter. <Link href={qs({ kosong: '1' })}>Tampilkan papan kosong</Link>
          </div>
        )}
      </div>
    </div>
  );
}
