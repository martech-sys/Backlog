import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  assignAction,
  closeAction,
  commentAction,
  customSetupAction,
  descriptionAction,
  editBriefAction,
  editDraftLinkAction,
  draftAction,
  finalAction,
  overrideAction,
  priorityAction,
  qcAction,
  reviewAction,
} from '@/app/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Journey } from '@/components/Journey';
import { MarkSeen } from '@/components/SeenMarker';
import { AssigneePicker } from '@/components/task/AssigneePicker';
import { CancelEdit, EditableSection } from '@/components/task/EditableSection';
import { ImagePicker } from '@/components/task/ImagePicker';
import { ThumbImg } from '@/components/task/ThumbImg';
import { Flash, LinkOrDash, Sisa, StatusBadge, UrgentBadge } from '@/components/ui';
import { ACTIVE_STATUSES, CAMPAIGN_TYPES, CATEGORIES, CUSTOM_CATEGORY, DIVISI, DONE_STATUSES, STATUS, type Status, TASK_STATUSES } from '@/lib/config';
import { now } from '@/lib/clock';
import { formatTanggal, formatWaktu, todayWib } from '@/lib/dates';
import { findRequest, findTask } from '@/lib/db';
import { getDbWithWa, requireUser } from '@/lib/session';
import { journeyOf } from '@/lib/journey';
import { seenKey } from '@/lib/mine';
import { canComment, canEditBriefFromTask, needsCustomSetup, parseDetailLine } from '@/lib/service';
import { previewUrl, uploadConfigured } from '@/lib/upload';
import { availableActions, can } from '@/lib/workflow';

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

const STAGE_HINT: Record<string, string> = {
  'Siap Assign': 'Menunggu lead memilih anggota yang mengerjakan.',
  Dikerjakan: 'Assignee sedang mengerjakan draft.',
  'QC Lead': 'Draft menunggu dicek lead divisi.',
  'Revisi Internal': 'Draft dikembalikan lead untuk diperbaiki.',
  'Review Brand': 'Draft menunggu review PIC brand.',
  'Revisi Brand': 'PIC brand meminta revisi; assignee memperbaiki draft.',
  ACC: 'Draft disetujui brand; tinggal upload file final.',
  Final: 'File final sudah diupload; menunggu Traffic menutup tiket.',
  Selesai: 'Tiket sudah ditutup.',
};

const JENIS_CLASS: Record<string, string> = {
  'QC lead': 'qc',
  'Revisi brand': 'rev',
  Draft: 'draft',
};
const JENIS_BADGE: Record<string, string> = {
  'QC lead': 'amber',
  'Revisi brand': 'red',
  Draft: 'blue',
  Catatan: 'outline',
};

function Thumbs({ urls, size = '' }: { urls: string[]; size?: string }) {
  if (!urls.length) return null;
  return (
    <div className="thumbs" style={{ marginTop: 8 }}>
      {urls.map((u, i) => {
        const src = previewUrl(u);
        return (
          <a key={u + i} href={u} target="_blank" rel="noreferrer" className={`thumb ${size}`} title="Buka ukuran penuh">
            <ThumbImg src={src} alt={`Lampiran ${i + 1}`} />
          </a>
        );
      })}
    </div>
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
  const customPending = needsCustomSetup(t);
  const actions = availableActions(user, t).filter((a) => !(customPending && a === 'assign'));
  const logs = db.statusLog.filter((l) => l.ID === id).sort((a, b) => b.Timestamp.localeCompare(a.Timestamp));
  const wa = db.waLog.filter((w) => w['Ref ID'] === id).sort((a, b) => b.Timestamp.localeCompare(a.Timestamp));
  const done = DONE_STATUSES.includes(t.Status as Status);
  const komentar = db.komentar.filter((k) => k['Task ID'] === id).sort((a, b) => a.Timestamp.localeCompare(b.Timestamp));
  const lampiranOf = (v: string) =>
    String(v || '')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
  const mayComment = canComment(db, user, t);
  const mayEditBrief = canEditBriefFromTask(db, user, t);
  const mayEditDraft = (Number(t['Versi Draft']) || 0) > 0 && !done && can.work(user, t);
  const catDef = CATEGORIES.find((c) => c.name === t.Kategori);
  const taskSubs = String(t['Sub-jenis'] || '').split(',').map((x) => x.trim());
  const detailValues = r ? parseDetailLine(r['Detail Kategori'], t.Kategori) : {};
  const canUpload = uploadConfigured();
  const mayEditDesc = !done && (can.work(user, t) || can.qc(user, t));
  const jenisOptions = [
    'Catatan',
    ...(can.qc(user, t) ? ['QC lead'] : []),
    ...(t.Status === STATUS.REVIEW_BRAND && can.review(user, t) ? ['Revisi brand'] : []),
  ];
  // Versi draft: dari riwayat (data lama) + baris komentar "Draft" (preview & catatan).
  const versions = new Map<string, { v: string; ts: string; link: string; previews: string[]; by: string }>();
  for (const line of String(t['Riwayat Draft'] || '')
    .split('\n')
    .filter(Boolean)) {
    const m = line.match(/^v(\d+) \(([^)]*)\):\s*(\S+)/);
    if (m)
      versions.set(m[1], {
        v: m[1],
        ts: m[2],
        link: m[3],
        previews: [],
        by: t.Assignee,
      });
  }
  for (const k of komentar.filter((x) => x.Jenis === 'Draft')) {
    const link = k.Isi.split('\n')[0];
    const prev = versions.get(k.Versi);
    versions.set(k.Versi, {
      v: k.Versi,
      ts: prev?.ts || k.Timestamp,
      link: prev?.link || link,
      previews: lampiranOf(k.Lampiran),
      by: k.Oleh,
    });
  }
  const versionList = [...versions.values()].sort((a, b) => Number(b.v) - Number(a.v));
  const qcRev = komentar.filter((k) => k.Jenis === 'QC lead' || k.Jenis === 'Revisi brand');

  const load = new Map<string, number>();
  for (const x of db.tasks)
    if (x.Assignee && ACTIVE_STATUSES.includes(x.Status as Status)) load.set(x.Assignee, (load.get(x.Assignee) || 0) + 1);
  // Semua anggota tim aktif dalam satu daftar (tanpa pengelompokan divisi); PIC brand tidak termasuk.
  const divisiLabel = (d: string) => DIVISI.find((x) => x.value === d)?.label || d || '-';
  const assigneeOptions = db.master.people
    .filter((p) => p.active && p.sources.includes('tim') && !(p.roles.length === 1 && p.roles[0] === 'pic'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({
      name: p.name,
      label: `${p.name}${p.isIntern ? ' (intern)' : ''} · ${divisiLabel(p.divisi)} · ${load.get(p.name) || 0}/${p.capacity} aktif`,
    }));

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
            {t.Brand} · {r?.['Campaign Name']} · {t.Kategori}
            {t['Jenis Custom'] ? ` "${t['Jenis Custom']}"` : ''} ({t.Divisi || 'divisi belum diatur'})
          </p>
        </div>
        <div className="row">
          <span className="badge outline">Bola di: {t['Bola di']}</span>
          <Sisa deadline={t.Deadline} today={today} done={done} />
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} big />
      <div className="stage-head">
        <div className="eyebrow">Tahap saat ini</div>
        <div className="stage-name">{t.Status}</div>
        <div className="stage-sub">
          {STAGE_HINT[t.Status] || ''}
          {t['Bola di'] && t['Bola di'] !== '-' ? ` Bola di: ${t['Bola di']}.` : ''}
        </div>
        <Journey pos={journeyOf(t, today)} size="lg" />
      </div>
      <MarkSeen seenKey={seenKey(t)} />

      <div className="grid grid-3">
        <div className="span-2 stack">
          {customPending ? (
            can.prioritize(user, t) ? (
              <section className="card action-card">
                <h2>Atur task custom</h2>
                <p className="muted">
                  Request ini memakai kategori <b>Lainnya (custom)</b>, jadi tidak dirouting otomatis. Tentukan divisi, lead, dan deadline,
                  atau ubah ke kategori yang sudah ada bila ternyata cocok.
                </p>
                <form action={customSetupAction} className="stack">
                  <input type="hidden" name="taskId" value={id} />
                  <div className="grid grid-2" style={{ gap: 12 }}>
                    <div className="field">
                      <label htmlFor="ckat">Kategori</label>
                      <select id="ckat" name="kategori" defaultValue={CUSTOM_CATEGORY}>
                        <option value={CUSTOM_CATEGORY}>Tetap custom</option>
                        {[...new Set(db.master.kategori.map((k) => k.kategori))]
                          .filter((k) => k !== CUSTOM_CATEGORY)
                          .map((k) => (
                            <option key={k} value={k}>
                              Ubah ke: {k}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="cjenis">Jenis pekerjaan (untuk rekap)</label>
                      <input id="cjenis" name="jenisCustom" placeholder="Mis. Banner marketplace" maxLength={60} />
                      <span className="help">Wajib bila tetap custom. Jenis yang muncul &gt; 3x/bulan jadi kandidat kategori baru.</span>
                    </div>
                    <div className="field">
                      <label htmlFor="cdiv">Divisi</label>
                      <select id="cdiv" name="divisi" defaultValue="">
                        <option value="">Pilih divisi…</option>
                        {DIVISI.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                      <span className="help">Bila mengubah kategori, divisi mengikuti aturan kategori itu.</span>
                    </div>
                    <div className="field">
                      <label htmlFor="clead">Lead</label>
                      <select id="clead" name="lead" defaultValue="">
                        <option value="">Otomatis (lead divisi & grup)</option>
                        {db.master.people
                          .filter((p) => p.active && p.isLead)
                          .map((p) => (
                            <option key={p.name} value={p.name}>
                              {p.name} · {p.divisi} · {p.grup}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="cdl">Deadline</label>
                      <input id="cdl" type="date" name="deadline" defaultValue={t.Deadline} required />
                    </div>
                  </div>
                  <div>
                    <SubmitButton>Simpan & kirim ke lead</SubmitButton>
                  </div>
                </form>
              </section>
            ) : (
              <div className="flash">Task custom ini sedang menunggu Traffic mengatur divisi, lead, dan deadline.</div>
            )
          ) : null}
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
                {canUpload ? (
                  <ImagePicker folder={id} label="Preview draft (opsional, agar lead & PIC bisa lihat tanpa buka Drive)" allowLink={false} canUpload>
                    <div className="field">
                      <label htmlFor="dnote">Catatan untuk lead (opsional)</label>
                      <textarea id="dnote" name="note" rows={2} placeholder="Mis. sudah ganti warna background sesuai revisi R1" />
                    </div>
                  </ImagePicker>
                ) : (
                  <div className="field">
                    <label htmlFor="dnote">Catatan untuk lead (opsional)</label>
                    <textarea id="dnote" name="note" rows={2} placeholder="Mis. sudah ganti warna background sesuai revisi R1" />
                    <span className="help">Bila link draft berupa gambar di Drive yang sudah dibagikan, pratinjaunya tampil otomatis di daftar versi.</span>
                  </div>
                )}
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
                <ImagePicker folder={id} canUpload={canUpload} label="Lampiran (opsional, mis. screenshot yang ditandai)" />
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
                <ImagePicker folder={id} canUpload={canUpload} label="Lampiran revisi (opsional, mis. screenshot yang ditandai)" />
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
                  <input
                    id="final"
                    type="url"
                    name="link"
                    required
                    placeholder={db.master.config.driveFolderUrl || 'https://drive.google.com/…'}
                  />
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

          <section className="card" id="deskripsi">
            <h2 style={{ marginBottom: 10 }}>Deskripsi & catatan pengerjaan</h2>
            {mayEditDesc ? (
              <form action={descriptionAction} className="stack">
                <input type="hidden" name="taskId" value={id} />
                <textarea
                  name="deskripsi"
                  rows={4}
                  defaultValue={t.Deskripsi}
                  placeholder="Mis. konsep yang dipakai, ukuran file, hal yang perlu diperhatikan, progres…"
                />
                <div>
                  <SubmitButton className="btn small">Simpan deskripsi</SubmitButton>
                </div>
              </form>
            ) : t.Deskripsi ? (
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{t.Deskripsi}</p>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                Belum ada deskripsi. Assignee atau lead bisa menambahkannya.
              </p>
            )}
          </section>

          <EditableSection
            key={`brief-${sp.ok || ''}`}
            id="brief"
            title="Brief"
            editLabel="Edit brief"
            canEdit={mayEditBrief}
            view={
              r ? (
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
                  <dd>{r.Objective || '-'}</dd>
                  <dt>USP</dt>
                  <dd>{r['Product Knowledge/USP'] || '-'}</dd>
                  <dt>Key message</dt>
                  <dd>{r['Key Message'] || '-'}</dd>
                  <dt>Creative note</dt>
                  <dd>{r['Creative Note'] || '-'}</dd>
                  <dt>Target audience</dt>
                  <dd>{r['Target Audience'] || '-'}</dd>
                  <dt>Budget</dt>
                  <dd>{Number(r.Budget) ? `Rp ${Number(r.Budget).toLocaleString('id-ID')}` : '-'}</dd>
                  <dt>Deliverables</dt>
                  <dd>{r.Deliverables || '-'}</dd>
                  <dt>Referensi</dt>
                  <dd>
                    <LinkOrDash href={r['Supporting Link']} /> <LinkOrDash href={r.Attachments} />
                  </dd>
                </dl>
              ) : (
                <p className="muted">Request induk tidak ditemukan.</p>
              )
            }
            form={
              r ? (
                <form action={editBriefAction} className="stack">
                  <input type="hidden" name="taskId" value={id} />
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="eb-campaignName">Campaign Name</label>
                      <input id="eb-campaignName" name="campaignName" defaultValue={r['Campaign Name']} required />
                    </div>
                    <div className="field">
                      <label htmlFor="eb-campaignType">Campaign Type</label>
                      <select id="eb-campaignType" name="campaignType" defaultValue={r['Campaign Type']} required>
                        {CAMPAIGN_TYPES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {catDef && catDef.subTypes.length > 1 ? (
                    <div className="field">
                      <span className="label">Sub-jenis {t.Kategori}</span>
                      <div className="choice-group">
                        {catDef.subTypes.map((x) => (
                          <label className="choice" key={x}>
                            <input type="checkbox" name="subJenis" value={x} defaultChecked={taskSubs.includes(x)} />
                            {x}
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : catDef ? (
                    <input type="hidden" name="subJenis" value={catDef.subTypes[0]} />
                  ) : null}
                  {catDef?.fields.length ? (
                    <div className="form-grid">
                      {catDef.fields.map((f) => (
                        <div className="field" key={f.key}>
                          <label htmlFor={`eb-d-${f.key}`}>
                            {f.label}
                            {f.required ? <span className="req"> *</span> : null}
                          </label>
                          {f.type === 'select' ? (
                            <select id={`eb-d-${f.key}`} name={`detail:${f.key}`} defaultValue={detailValues[f.key] || ''}>
                              <option value="">Pilih…</option>
                              {(f.options || []).map((o) => (
                                <option key={o}>{o}</option>
                              ))}
                            </select>
                          ) : f.type === 'textarea' ? (
                            <textarea id={`eb-d-${f.key}`} name={`detail:${f.key}`} defaultValue={detailValues[f.key] || ''} rows={2} />
                          ) : (
                            <input
                              id={`eb-d-${f.key}`}
                              name={`detail:${f.key}`}
                              type={f.type === 'number' ? 'number' : 'text'}
                              defaultValue={detailValues[f.key] || ''}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="field">
                    <label htmlFor="eb-objective">Objective</label>
                    <textarea id="eb-objective" name="objective" defaultValue={r.Objective} rows={2} required />
                  </div>
                  <div className="field">
                    <label htmlFor="eb-usp">Product Knowledge/USP</label>
                    <textarea id="eb-usp" name="usp" defaultValue={r['Product Knowledge/USP']} rows={2} />
                  </div>
                  <div className="field">
                    <label htmlFor="eb-keyMessage">Key message</label>
                    <textarea id="eb-keyMessage" name="keyMessage" defaultValue={r['Key Message']} rows={2} />
                  </div>
                  <div className="field">
                    <label htmlFor="eb-creativeNote">Creative note</label>
                    <textarea id="eb-creativeNote" name="creativeNote" defaultValue={r['Creative Note']} rows={2} />
                  </div>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="eb-targetAudience">Target audience</label>
                      <input id="eb-targetAudience" name="targetAudience" defaultValue={r['Target Audience']} />
                    </div>
                    <div className="field">
                      <label htmlFor="eb-budget">Budget (Rp)</label>
                      <input
                        id="eb-budget"
                        name="budget"
                        inputMode="numeric"
                        defaultValue={Number(r.Budget) ? Number(r.Budget).toLocaleString('id-ID') : ''}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="eb-deliverables">Deliverables</label>
                      <input id="eb-deliverables" name="deliverables" defaultValue={r.Deliverables} />
                    </div>
                    <div className="field">
                      <label htmlFor="eb-supportingLink">Supporting link</label>
                      <input id="eb-supportingLink" name="supportingLink" type="url" defaultValue={r['Supporting Link']} placeholder="https://…" />
                    </div>
                    <div className="field">
                      <label htmlFor="eb-attachments">Attachments (link)</label>
                      <input id="eb-attachments" name="attachments" defaultValue={r.Attachments} placeholder="https://drive.google.com/…" />
                    </div>
                  </div>
                  <div className="actions-row">
                    <SubmitButton>Simpan brief</SubmitButton>
                    <CancelEdit />
                  </div>
                  <span className="help">Perubahan berlaku untuk request {r['Request ID']}, tercatat di riwayat, dan tim task diberi tahu lewat WA.</span>
                </form>
              ) : null
            }
          />



          <EditableSection
            key={`draft-${sp.ok || ''}`}
            id="draft"
            title=<>
                Draft ({versionList.length} versi){' '}
                {t['Link Final'] ? (
                  <span className="badge green" style={{ marginLeft: 6 }}>
                    Final tersedia
                  </span>
                ) : null}
              </>
            editLabel="Ubah link draft terbaru"
            canEdit={mayEditDraft}
            view={
              <>
            {versionList.length ? (
              <div className="versions">
                {versionList.map((v) => {
                  const imgs = v.previews.length ? v.previews : [v.link];
                  return (
                    <div key={v.v} className="version">
                      <Thumbs urls={imgs.slice(0, 1)} size="lg" />
                      <b>
                        v{v.v} {v.v === String(Number(t['Versi Draft']) || 0) ? <span className="badge blue">terbaru</span> : null}
                      </b>
                      <span className="subtle">{formatWaktu(v.ts)}</span>
                      <a href={v.link} target="_blank" rel="noreferrer">
                        Buka file
                      </a>
                      {v.previews.length > 1 ? <span className="subtle">+{v.previews.length - 1} preview</span> : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                Belum ada draft.
              </p>
            )}
            {t['Link Final'] ? (
              <p style={{ marginBottom: 0 }}>
                <b>Final:</b> <LinkOrDash href={t['Link Final']} />
              </p>
            ) : null}
              </>
            }
            form={
              <form action={editDraftLinkAction} className="stack">
                <input type="hidden" name="taskId" value={id} />
                <div className="field">
                  <label htmlFor="ed-link">Link draft v{Number(t['Versi Draft']) || 0}</label>
                  <input id="ed-link" name="link" type="url" required defaultValue={t['Link Draft']} />
                  <span className="help">Untuk memperbaiki link yang salah tempel. Mengirim versi baru tetap lewat Upload draft.</span>
                </div>
                <div className="actions-row">
                  <SubmitButton>Simpan link</SubmitButton>
                  <CancelEdit />
                </div>
              </form>
            }
          />

          <section className="card">
            <h2 style={{ marginBottom: 10 }}>Catatan QC & revisi brand ({Number(t['Ronde Revisi']) || 0} ronde)</h2>
            {qcRev.length ? (
              <ul className="comments">
                {[...qcRev].reverse().map((k) => (
                  <li key={k['Komentar ID']} className={`comment ${JENIS_CLASS[k.Jenis] || ''}`}>
                    <div className="comment-head">
                      <span className={`badge ${JENIS_BADGE[k.Jenis] || ''}`}>{k.Jenis}</span>
                      <b>{k.Oleh}</b>
                      <span className="subtle">
                        v{k.Versi} · {formatWaktu(k.Timestamp)}
                      </span>
                    </div>
                    <p className="comment-body">{k.Isi}</p>
                    <Thumbs urls={lampiranOf(k.Lampiran)} />
                  </li>
                ))}
              </ul>
            ) : (
              <Notes text={[t['Catatan QC'], t['Catatan Revisi']].filter(Boolean).join('\n')} />
            )}
          </section>

          <section className="card" id="komentar">
            <h2 style={{ marginBottom: 10 }}>Komentar ({komentar.length})</h2>
            {komentar.length ? (
              <ul className="comments">
                {komentar.map((k) => (
                  <li key={k['Komentar ID']} className={`comment ${JENIS_CLASS[k.Jenis] || ''}`}>
                    <div className="comment-head">
                      <b>{k.Oleh}</b>
                      <span className="subtle">{k.Peran}</span>
                      <span className={`badge ${JENIS_BADGE[k.Jenis] || ''}`}>{k.Jenis === 'Draft' ? `Draft v${k.Versi}` : k.Jenis}</span>
                      <span className="subtle" style={{ marginLeft: 'auto' }}>
                        {k.Jenis !== 'Draft' && Number(k.Versi) > 0 ? `untuk v${k.Versi} · ` : ''}
                        {formatWaktu(k.Timestamp)}
                      </span>
                    </div>
                    {k.Isi ? <p className="comment-body">{k.Isi}</p> : null}
                    <Thumbs urls={lampiranOf(k.Lampiran)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Belum ada komentar.</p>
            )}
            {mayComment ? (
              <form action={commentAction} key={komentar.length} className="stack" style={{ marginTop: 14 }}>
                <input type="hidden" name="taskId" value={id} />
                <ImagePicker folder={id} canUpload={canUpload}>
                  <div className="field">
                    <label htmlFor="isi">Tulis komentar</label>
                    <textarea
                      id="isi"
                      name="isi"
                      rows={3}
                      placeholder={canUpload ? 'Tulis komentar… (bisa tempel screenshot dengan Ctrl/Cmd + V)' : 'Tulis komentar…'}
                    />
                  </div>
                </ImagePicker>
                <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  {jenisOptions.length > 1 ? (
                    <div className="field" style={{ minWidth: 160 }}>
                      <label htmlFor="jenis">Label</label>
                      <select id="jenis" name="jenis" defaultValue="Catatan">
                        {jenisOptions.map((j) => (
                          <option key={j} value={j}>
                            {j}
                            {j === 'Revisi brand' ? ' (ronde revisi +1)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <input type="hidden" name="jenis" value="Catatan" />
                  )}
                  {Number(t['Versi Draft']) > 0 ? (
                    <div className="field" style={{ minWidth: 130 }}>
                      <label htmlFor="versi">Untuk draft</label>
                      <select id="versi" name="versi" defaultValue={String(Number(t['Versi Draft']))}>
                        {Array.from({ length: Number(t['Versi Draft']) }, (_, i) => Number(t['Versi Draft']) - i).map((v) => (
                          <option key={v} value={v}>
                            v{v}
                            {v === Number(t['Versi Draft']) ? ' (terbaru)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <SubmitButton pendingText="Mengirim…">Kirim komentar</SubmitButton>
                </div>
                <span className="help">
                  Label Revisi brand selalu untuk draft terbaru. Pemegang bola ({t['Bola di']}) diberi tahu lewat WA.
                </span>
              </form>
            ) : null}
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
                <AssigneePicker options={assigneeOptions} current={t.Assignee} />
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
