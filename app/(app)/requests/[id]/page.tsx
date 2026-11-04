import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cekBriefAction } from '@/app/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Flash, LinkOrDash, rupiah, Sisa, StatusBadge, UrgentBadge } from '@/components/ui';
import { DONE_STATUSES, REQUEST_STATUS, type Status } from '@/lib/config';
import { now } from '@/lib/clock';
import { formatTanggal, formatWaktu, todayWib } from '@/lib/dates';
import { findRequest, tasksOf } from '@/lib/db';
import { getDbWithWa, requireUser } from '@/lib/session';
import { can } from '@/lib/workflow';

type Params = Promise<{ id: string }>;
type SP = Promise<Record<string, string | undefined>>;

export async function generateMetadata({ params }: { params: Params }) {
  return { title: decodeURIComponent((await params).id) };
}

export default async function RequestDetail({ params, searchParams }: { params: Params; searchParams: SP }) {
  const user = await requireUser();
  const id = decodeURIComponent((await params).id);
  const sp = await searchParams;
  const db = await getDbWithWa();
  const r = findRequest(db, id);
  if (!r) notFound();
  const today = todayWib(now());
  const tasks = tasksOf(db, id);
  const ids = new Set([id, ...tasks.map((t) => t['Task ID'])]);
  const logs = db.statusLog.filter((l) => ids.has(l.ID)).sort((a, b) => b.Timestamp.localeCompare(a.Timestamp));
  const wa = db.waLog.filter((w) => ids.has(w['Ref ID'])).sort((a, b) => b.Timestamp.localeCompare(a.Timestamp));
  const canCek = can.cekBrief(user, r) && (r.Status === REQUEST_STATUS.BARU || r.Status === REQUEST_STATUS.BRIEF_KURANG);
  const canEdit = can.editBrief(user, r) && (r.Status === REQUEST_STATUS.BRIEF_KURANG || r.Status === REQUEST_STATUS.BARU);

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <div className="page-head">
        <div>
          <div className="row">
            <Link href="/requests" className="subtle">
              ← Request
            </Link>
          </div>
          <h1 className="row">
            {r['Request ID']} <StatusBadge status={r.Status} /> <UrgentBadge urgent={r.Urgent} />
          </h1>
          <p>
            {r.Brand} · {r['Campaign Name']} · diajukan {r['PIC Brand']} {formatWaktu(r.Timestamp)}
          </p>
        </div>
        {canEdit ? (
          <Link className="btn" href={`/requests/${encodeURIComponent(id)}/edit`}>
            {r.Status === REQUEST_STATUS.BRIEF_KURANG ? 'Lengkapi brief' : 'Edit brief'}
          </Link>
        ) : null}
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      {r.Status === REQUEST_STATUS.BRIEF_KURANG ? (
        <div className="flash err">
          Brief dikembalikan oleh Traffic: <b>{r['Catatan Traffic'] || '-'}</b>
          {canEdit ? (
            <>
              {' '}
              · <Link href={`/requests/${encodeURIComponent(id)}/edit`}>Lengkapi sekarang</Link>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-3">
        <div className="span-2 stack">
          {canCek ? (
            <section className="card action-card" id="cek-brief">
              <div className="card-head">
                <div>
                  <h2>Cek brief (Traffic)</h2>
                  <p>Pastikan brief lengkap dan konfirmasi deadline. Bila lengkap, sistem memecah request menjadi task per divisi dan mengabari lead.</p>
                </div>
              </div>
              <form action={cekBriefAction}>
                <input type="hidden" name="requestId" value={id} />
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="deadline">Deadline final</label>
                    <input id="deadline" type="date" name="deadline" defaultValue={r.Deadline || r['Due Date']} min={today} />
                    <span className="help">Due date dari PIC: {formatTanggal(r['Due Date'])}. Lead time minimum {r['Lead Time Min (hari kerja)']} hari kerja.</span>
                  </div>
                  <div className="field">
                    <label htmlFor="note">Catatan untuk PIC / tim</label>
                    <textarea id="note" name="note" placeholder="Wajib diisi bila brief kurang: apa yang perlu dilengkapi" />
                  </div>
                </div>
                <div className="actions-row">
                  <SubmitButton name="decision" value="Lengkap" className="btn success">
                    Brief lengkap, proses
                  </SubmitButton>
                  <SubmitButton name="decision" value="Kurang" className="btn danger">
                    Brief kurang, kembalikan ke PIC
                  </SubmitButton>
                </div>
              </form>
            </section>
          ) : null}

          <section className="card">
            <div className="card-head">
              <h2>Brief</h2>
              <span className="subtle">{r['Campaign Type']}</span>
            </div>
            <dl className="kv">
              <dt>Brand</dt>
              <dd>
                {r.Brand} ({r.Grup})
              </dd>
              <dt>Campaign</dt>
              <dd>{r['Campaign Name']}</dd>
              <dt>Objective</dt>
              <dd>{r.Objective}</dd>
              <dt>Kategori</dt>
              <dd>
                {r.Kategori}
                {r['Sub-jenis'] ? <span className="subtle"> · {r['Sub-jenis']}</span> : null}
              </dd>
              <dt>Detail kategori</dt>
              <dd>{r['Detail Kategori'] || '-'}</dd>
              <dt>Product knowledge / USP</dt>
              <dd>{r['Product Knowledge/USP']}</dd>
              <dt>Key message</dt>
              <dd>{r['Key Message']}</dd>
              <dt>Creative note</dt>
              <dd>{r['Creative Note']}</dd>
              <dt>Target audience</dt>
              <dd>{r['Target Audience']}</dd>
              <dt>Budget</dt>
              <dd>{rupiah(r.Budget)}</dd>
              <dt>Deliverables</dt>
              <dd>{r.Deliverables}</dd>
              <dt>Supporting link</dt>
              <dd>
                <LinkOrDash href={r['Supporting Link']} />
              </dd>
              <dt>Lampiran</dt>
              <dd>
                <LinkOrDash href={r.Attachments} />
              </dd>
            </dl>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Task per divisi</h2>
              <span className="subtle">{tasks.length} task</span>
            </div>
            {tasks.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Divisi</th>
                      <th>Lead</th>
                      <th>Assignee</th>
                      <th>Status</th>
                      <th>Bola di</th>
                      <th>Deadline</th>
                      <th>Sisa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t) => (
                      <tr key={t['Task ID']}>
                        <td className="nowrap">
                          <Link className="title" href={`/tasks/${t['Task ID']}`}>
                            {t['Task ID']}
                          </Link>
                        </td>
                        <td>
                          {t.Divisi}
                          <div className="subtle">{t.Kategori}</div>
                        </td>
                        <td>{t.Lead}</td>
                        <td>{t.Assignee || <span className="badge outline">Belum assign</span>}</td>
                        <td>
                          <StatusBadge status={t.Status} />
                        </td>
                        <td>{t['Bola di']}</td>
                        <td className="nowrap">{formatTanggal(t.Deadline)}</td>
                        <td className="nowrap">
                          <Sisa deadline={t.Deadline} today={today} done={DONE_STATUSES.includes(t.Status as Status)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">Task dibuat otomatis setelah Traffic menyatakan brief lengkap.</p>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <h2 style={{ marginBottom: 10 }}>Ringkasan</h2>
            <dl className="kv" style={{ gridTemplateColumns: '110px minmax(0,1fr)' }}>
              <dt>PIC brand</dt>
              <dd>{r['PIC Brand']}</dd>
              <dt>Traffic</dt>
              <dd>{r.Traffic}</dd>
              <dt>Creative Head</dt>
              <dd>{r['Creative Head']}</dd>
              <dt>Due date</dt>
              <dd>{formatTanggal(r['Due Date'])}</dd>
              <dt>Deadline</dt>
              <dd>
                {formatTanggal(r.Deadline)}{' '}
                <Sisa deadline={r.Deadline} today={today} done={r.Status === REQUEST_STATUS.SELESAI} />
              </dd>
              <dt>Cek brief</dt>
              <dd>{r['Cek Brief'] || 'Belum'}</dd>
              {r['Catatan Traffic'] ? (
                <>
                  <dt>Catatan Traffic</dt>
                  <dd>{r['Catatan Traffic']}</dd>
                </>
              ) : null}
            </dl>
          </section>

          <section className="card">
            <h2 style={{ marginBottom: 10 }}>Riwayat status</h2>
            {logs.length ? (
              <ul className="timeline">
                {logs.map((l, i) => (
                  <li key={i}>
                    <time>{formatWaktu(l.Timestamp)}</time>
                    <div>
                      <b>{l.ID === id ? 'Request' : l.ID.replace(`${id}-`, 'Task ')}</b>: {l.Dari && l.Dari !== l.Ke ? `${l.Dari} → ` : ''}
                      {l.Ke}
                      <div className="note">
                        {l.Oleh}
                        {l.Catatan ? ` · ${l.Catatan}` : ''}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Belum ada riwayat.</p>
            )}
          </section>

          <section className="card">
            <h2 style={{ marginBottom: 10 }}>Notifikasi WA</h2>
            {wa.length ? (
              <ul className="timeline">
                {wa.slice(0, 20).map((w, i) => (
                  <li key={i}>
                    <time>{formatWaktu(w.Timestamp)}</time>
                    <div>
                      <b>{w.Arah === 'IN' ? '← ' : '→ '}
                        {w.Nama || w.Nomor}</b>{' '}
                      · {w.Jenis}
                      <div className="note">{w.Hasil}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Belum ada pesan.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
