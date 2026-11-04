import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  assignAction,
  closeAction,
  draftAction,
  finalAction,
  overrideAction,
  priorityAction,
  qcAction,
  reviewAction,
} from '@/app/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Flash, LinkOrDash, Sisa, StatusBadge, UrgentBadge } from '@/components/ui';
import { ACTIVE_STATUSES, DONE_STATUSES, STATUS, TASK_STATUSES, type Status } from '@/lib/config';
import { now } from '@/lib/clock';
import { formatTanggal, formatWaktu, todayWib } from '@/lib/dates';
import { findRequest, findTask } from '@/lib/db';
import { getDbWithWa, requireUser } from '@/lib/session';
import { availableActions } from '@/lib/workflow';

type Params = Promise<{ id: string }>;
type SP = Promise<Record<string, string | undefined>>;

export async function generateMetadata({ params }: { params: Params }) {
  return { title: decodeURIComponent((await params).id) };
}

function Notes({ text }: { text: string }) {
  if (!text) return <span className="subtle">-</span>;
  return (
    <ul className="timeline">
      {text
        .split('\n')
        .filter(Boolean)
        .reverse()
        .map((line, i) => (
          <li key={i} style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
            <span className="note">{line}</span>
          </li>
        ))}
    </ul>
  );
}

export default async function TaskDetail({ params, searchParams }: { params: Params; searchParams: SP }) {
  const user = await requireUser();
  const id = decodeURIComponent((await params).id);
  const sp = await searchParams;
  const db = await getDbWithWa();
  const t = findTask(db, id);
  if (!t) notFound();
  const r = findRequest(db, t['Request ID']);
  const today = todayWib(now());
  const actions = availableActions(user, t);
  const logs = db.statusLog.filter((l) => l.ID === id).sort((a, b) => b.Timestamp.localeCompare(a.Timestamp));
  const wa = db.waLog.filter((w) => w['Ref ID'] === id).sort((a, b) => b.Timestamp.localeCompare(a.Timestamp));
  const done = DONE_STATUSES.includes(t.Status as Status);

  const load = new Map<string, number>();
  for (const x of db.tasks) if (x.Assignee && ACTIVE_STATUSES.includes(x.Status as Status)) load.set(x.Assignee, (load.get(x.Assignee) || 0) + 1);
  const creative = db.master.people.filter((p) => p.active && !['management', 'traffic', 'brand'].includes(p.divisi.toLowerCase()));
  const sameDivisi = creative.filter((p) => p.divisi === t.Divisi);
  const others = creative.filter((p) => p.divisi !== t.Divisi);
  const optLabel = (name: string, cap: number, intern: boolean) => `${name}${intern ? ' (intern)' : ''} · ${load.get(name) || 0}/${cap} aktif`;

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <div className="page-head">
        <div>
          <Link href={`/requests/${t['Request ID']}`} className="subtle">
            ← {t['Request ID']}
          </Link>
          <h1 className="row">
            {id} <StatusBadge status={t.Status} /> <UrgentBadge urgent={t.Urgent} />
          </h1>
          <p>
            {t.Brand} · {r?.['Campaign Name']} · {t.Kategori} ({t.Divisi})
          </p>
        </div>
        <div className="row">
          <span className="badge outline">Bola di: {t['Bola di']}</span>
          <Sisa deadline={t.Deadline} today={today} done={done} />
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="grid grid-3">
        <div className="span-2 stack">
          {actions.includes('draft') ? (
            <section className="card action-card">
              <h2>{t.Status === STATUS.DIKERJAKAN ? 'Upload draft' : 'Upload draft revisi'}</h2>
              <p className="muted">
                Simpan file di Google Drive, lalu tempel link-nya. Draft dikirim ke {t.Lead} untuk QC sebelum ke brand.
              </p>
              {t.Status === STATUS.REVISI_INTERNAL && t['Catatan QC'] ? (
                <div className="flash err">Catatan QC terakhir: {t['Catatan QC'].split('\n').pop()}</div>
              ) : null}
              {t.Status === STATUS.REVISI_BRAND && t['Catatan Revisi'] ? (
                <div className="flash err">Revisi brand: {t['Catatan Revisi'].split('\n').pop()}</div>
              ) : null}
              <form action={draftAction}>
                <input type="hidden" name="taskId" value={id} />
                <div className="field">
                  <label htmlFor="link">Link draft v{(Number(t['Versi Draft']) || 0) + 1}</label>
                  <input id="link" type="url" name="link" required placeholder="https://drive.google.com/…" />
                </div>
                <div>
                  <SubmitButton>Kirim ke QC</SubmitButton>
                </div>
              </form>
            </section>
          ) : null}

          {actions.includes('qc') ? (
            <section className="card action-card">
              <h2>QC draft v{t['Versi Draft']}</h2>
              <p className="muted">
                Draft: <LinkOrDash href={t['Link Draft']} /> · oleh {t.Assignee}
              </p>
              <form action={qcAction}>
                <input type="hidden" name="taskId" value={id} />
                <div className="field">
                  <label htmlFor="qcnote">Catatan QC</label>
                  <textarea id="qcnote" name="note" placeholder="Wajib bila belum lolos" />
                </div>
                <div className="actions-row">
                  <SubmitButton name="decision" value="pass" className="btn success">
                    Lolos QC, kirim ke brand
                  </SubmitButton>
                  <SubmitButton name="decision" value="fail" className="btn danger">
                    Belum lolos, kembalikan
                  </SubmitButton>
                </div>
              </form>
            </section>
          ) : null}

          {actions.includes('review') ? (
            <section className="card action-card">
              <h2>Review brand</h2>
              <p className="muted">
                Draft v{t['Versi Draft']}: <LinkOrDash href={t['Link Draft']} />
                <br />
                PIC juga bisa membalas lewat WhatsApp: <b>ACC {id}</b> atau <b>REV {id} &lt;catatan&gt;</b>.
              </p>
              <form action={reviewAction}>
                <input type="hidden" name="taskId" value={id} />
                <div className="field">
                  <label htmlFor="revnote">Catatan revisi</label>
                  <textarea id="revnote" name="note" placeholder="Wajib bila minta revisi" />
                  <span className="help">
                    Ronde revisi saat ini: {Number(t['Ronde Revisi']) || 0} (batas {db.master.config.maxRevisi})
                  </span>
                </div>
                <div className="actions-row">
                  <SubmitButton name="decision" value="ACC" className="btn success">
                    ACC
                  </SubmitButton>
                  <SubmitButton name="decision" value="REV" className="btn danger">
                    Minta revisi
                  </SubmitButton>
                </div>
              </form>
            </section>
          ) : null}

          {actions.includes('final') ? (
            <section className="card action-card">
              <h2>Upload file final</h2>
              <p className="muted">Draft sudah di-ACC brand. Upload file final ke Drive dan tempel link-nya.</p>
              <form action={finalAction}>
                <input type="hidden" name="taskId" value={id} />
                <div className="field">
                  <label htmlFor="final">Link file final</label>
                  <input id="final" type="url" name="link" required placeholder={db.master.config.driveFolderUrl || 'https://drive.google.com/…'} />
                </div>
                <div>
                  <SubmitButton>Simpan file final</SubmitButton>
                </div>
              </form>
            </section>
          ) : null}

          {actions.includes('close') ? (
            <section className="card action-card">
              <h2>Tutup tiket</h2>
              <p className="muted">
                File final: <LinkOrDash href={t['Link Final']} />
              </p>
              <form action={closeAction}>
                <input type="hidden" name="taskId" value={id} />
                <SubmitButton className="btn success">Tutup tiket</SubmitButton>
              </form>
            </section>
          ) : null}

          <section className="card">
            <h2 style={{ marginBottom: 10 }}>Brief</h2>
            {r ? (
              <dl className="kv">
                <dt>Campaign</dt>
                <dd>
                  {r['Campaign Name']} <span className="subtle">({r['Campaign Type']})</span>
                </dd>
                <dt>Sub-jenis</dt>
                <dd>{t['Sub-jenis'] || '-'}</dd>
                <dt>Detail</dt>
                <dd>
                  {r['Detail Kategori']
                    .split('\n')
                    .filter((l) => l.startsWith(t.Kategori))
                    .join('\n') || '-'}
                </dd>
                <dt>Objective</dt>
                <dd>{r.Objective}</dd>
                <dt>USP</dt>
                <dd>{r['Product Knowledge/USP']}</dd>
                <dt>Key message</dt>
                <dd>{r['Key Message']}</dd>
                <dt>Creative note</dt>
                <dd>{r['Creative Note']}</dd>
                <dt>Target audience</dt>
                <dd>{r['Target Audience']}</dd>
                <dt>Deliverables</dt>
                <dd>{r.Deliverables}</dd>
                <dt>Referensi</dt>
                <dd>
                  <LinkOrDash href={r['Supporting Link']} /> <LinkOrDash href={r.Attachments} />
                </dd>
              </dl>
            ) : (
              <p className="muted">Request induk tidak ditemukan.</p>
            )}
          </section>

          <section className="grid grid-2">
            <div className="card">
              <h3 style={{ marginBottom: 8 }}>Draft (v{Number(t['Versi Draft']) || 0})</h3>
              <Notes text={t['Riwayat Draft']} />
              {t['Link Final'] ? (
                <p>
                  <b>Final:</b> <LinkOrDash href={t['Link Final']} />
                </p>
              ) : null}
            </div>
            <div className="card">
              <h3 style={{ marginBottom: 8 }}>Catatan QC & revisi brand ({Number(t['Ronde Revisi']) || 0} ronde)</h3>
              <Notes text={[t['Catatan QC'], t['Catatan Revisi']].filter(Boolean).join('\n')} />
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <h2 style={{ marginBottom: 10 }}>Detail</h2>
            <dl className="kv" style={{ gridTemplateColumns: '110px minmax(0,1fr)' }}>
              <dt>PIC brand</dt>
              <dd>{t['PIC Brand']}</dd>
              <dt>Lead</dt>
              <dd>{t.Lead}</dd>
              <dt>Assignee</dt>
              <dd>{t.Assignee || 'Belum di-assign'}</dd>
              <dt>Target draft</dt>
              <dd>{formatTanggal(t['Target Draft'])}</dd>
              <dt>Deadline</dt>
              <dd>{formatTanggal(t.Deadline)}</dd>
              <dt>Status sejak</dt>
              <dd>{formatWaktu(t['Status Sejak'])}</dd>
              {t['Selesai Pada'] ? (
                <>
                  <dt>Final pada</dt>
                  <dd>{formatWaktu(t['Selesai Pada'])}</dd>
                </>
              ) : null}
            </dl>
          </section>

          {actions.includes('assign') ? (
            <section className="card">
              <h2>{t.Assignee ? 'Ganti assignee' : 'Assign anggota'}</h2>
              <form action={assignAction} className="stack" style={{ marginTop: 10 }}>
                <input type="hidden" name="taskId" value={id} />
                <select name="assignee" required defaultValue="">
                  <option value="" disabled>
                    Pilih anggota…
                  </option>
                  <optgroup label={`Divisi ${t.Divisi}`}>
                    {sameDivisi.map((p) => (
                      <option key={p.name} value={p.name}>
                        {optLabel(p.name, p.capacity, p.isIntern)}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Divisi lain">
                    {others.map((p) => (
                      <option key={p.name} value={p.name}>
                        {optLabel(p.name, p.capacity, p.isIntern)} · {p.divisi}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <SubmitButton className="btn primary block">{t.Assignee ? 'Ganti' : 'Assign'}</SubmitButton>
              </form>
            </section>
          ) : null}

          {actions.includes('priority') ? (
            <section className="card">
              <h2>Prioritas & deadline</h2>
              <form action={priorityAction} className="stack" style={{ marginTop: 10 }}>
                <input type="hidden" name="taskId" value={id} />
                <div className="field">
                  <label htmlFor="pdeadline">Deadline</label>
                  <input id="pdeadline" type="date" name="deadline" defaultValue={t.Deadline} required />
                </div>
                <div className="field">
                  <label htmlFor="purgent">Prioritas</label>
                  <select id="purgent" name="urgent" defaultValue={t.Urgent === 'Ya' ? 'Ya' : 'Tidak'}>
                    <option value="Tidak">Normal</option>
                    <option value="Ya">URGENT</option>
                  </select>
                </div>
                <SubmitButton className="btn block">Simpan</SubmitButton>
              </form>
            </section>
          ) : null}

          {actions.includes('override') ? (
            <section className="card">
              <h2>Koreksi status (admin)</h2>
              <form action={overrideAction} className="stack" style={{ marginTop: 10 }}>
                <input type="hidden" name="taskId" value={id} />
                <select name="status" defaultValue={t.Status}>
                  {TASK_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <input type="text" name="note" placeholder="Alasan (wajib)" required />
                <SubmitButton className="btn danger block">Paksa status</SubmitButton>
              </form>
            </section>
          ) : null}

          <section className="card">
            <h2 style={{ marginBottom: 10 }}>Riwayat status</h2>
            <ul className="timeline">
              {logs.map((l, i) => (
                <li key={i}>
                  <time>{formatWaktu(l.Timestamp)}</time>
                  <div>
                    {l.Dari && l.Dari !== l.Ke ? `${l.Dari} → ` : ''}
                    <b>{l.Ke}</b>
                    <div className="note">
                      {l.Oleh}
                      {l.Catatan ? ` · ${l.Catatan}` : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h2 style={{ marginBottom: 10 }}>Notifikasi WA</h2>
            {wa.length ? (
              <ul className="timeline">
                {wa.slice(0, 15).map((w, i) => (
                  <li key={i}>
                    <time>{formatWaktu(w.Timestamp)}</time>
                    <div>
                      <b>
                        {w.Arah === 'IN' ? '← ' : '→ '}
                        {w.Nama || w.Nomor}
                      </b>{' '}
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
