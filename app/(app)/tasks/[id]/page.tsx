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
  editDetailAction,
  archiveTaskAction,
} from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';
import { SubmitButton } from '@/components/SubmitButton';
import { Journey } from '@/components/Journey';
import { MarkSeen } from '@/components/SeenMarker';
import { AssigneePicker } from '@/components/task/AssigneePicker';
import { CancelEdit, EditableSection } from '@/components/task/EditableSection';
import { ImagePicker } from '@/components/task/ImagePicker';
import { ThumbImg } from '@/components/task/ThumbImg';
import { Flash, HealthBadge, LinkOrDash, Sisa, StatusBadge, UrgentBadge } from '@/components/ui';
import { taskHealth, taskTitle } from '@/lib/taskInfo';
import { ACTIVE_STATUSES, CAMPAIGN_TYPES, CUSTOM_CATEGORY, DIVISI, DONE_STATUSES, STATUS, type Status, TASK_STATUSES } from '@/lib/config';
import { now } from '@/lib/clock';
import { formatTanggal, formatWaktu, todayWib } from '@/lib/dates';
import { findRequest, findTask } from '@/lib/db';
import { getDbWithWa, requireUser } from '@/lib/session';
import { categoryDefs } from '@/lib/categories';
import { journeyOf } from '@/lib/journey';
import { seenKey } from '@/lib/mine';
import { canArchive, canComment, canEditBriefFromTask, canEditClosedDetail, needsCustomSetup, parseDetailLine } from '@/lib/service';
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
  'Siap Assign': 'Waiting for the lead to pick a member to work on it.',
  Dikerjakan: 'The assignee is working on the draft.',
  'QC Lead': 'Draft is waiting for the division lead to check it.',
  'Revisi Internal': 'Draft was sent back by the lead for fixes.',
  'Review Brand': 'Draft is waiting for review by the brand PIC.',
  'Revisi Brand': 'The brand PIC requested a revision; the assignee is fixing the draft.',
  ACC: 'Draft approved by the brand; only the final file upload is left.',
  Final: 'Final file uploaded; waiting for Traffic to close the ticket.',
  Selesai: 'Ticket closed.',
};

// Label tampilan untuk jenis komentar (nilai data tetap bahasa Indonesia).
const JENIS_LABEL: Record<string, string> = {
  'QC lead': 'Lead QC',
  'Revisi brand': 'Brand revision',
  Catatan: 'Note',
};
const jenisLabel = (j: string) => JENIS_LABEL[j] || j;

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
          <a key={u + i} href={u} target="_blank" rel="noreferrer" className={`thumb ${size}`} title="Open full size">
            <ThumbImg src={src} alt={`Attachment ${i + 1}`} />
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
  const catDefs = categoryDefs(db.master, { includeInactive: true });
  const catDef = catDefs.find((c) => c.name === t.Kategori);
  const taskSubs = String(t['Sub-jenis'] || '').split(',').map((x) => x.trim());
  const detailValues = r ? parseDetailLine(r['Detail Kategori'], t.Kategori, catDefs) : {};
  const mayEditDetail = canEditClosedDetail(user, t);
  const mayArchive = canArchive(user);
  const teamOptions = db.master.people
    .filter((p) => p.sources.includes('tim') && (p.active || p.name === t.Lead || p.name === t.Assignee))
    .map((p) => p.name)
    .sort((a, b) => a.localeCompare(b));
  const picOptions = db.master.people
    .filter((p) => p.roles.includes('pic') && (p.active || p.name === t['PIC Brand']))
    .map((p) => p.name)
    .sort((a, b) => a.localeCompare(b));
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
      label: `${p.name}${p.isIntern ? ' (intern)' : ''} · ${divisiLabel(p.divisi)} · ${load.get(p.name) || 0}/${p.capacity} active`,
    }));

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <div className="page-head">
        <div>
          <Link href={`/requests/${t['Request ID']}`} className="subtle">
            ← {t['Request ID']}
          </Link>
          <h1 className="row">
            {taskTitle(t, r)} <StatusBadge status={t.Status} /> <UrgentBadge urgent={t.Urgent} /> <HealthBadge health={taskHealth(t, today)} withValue />
          </h1>
          <p className="task-code" style={{ fontSize: 12.5, marginTop: 0 }}>
            {id}
          </p>
          <p>
            {t.Brand} · {r?.['Campaign Name']} · {t.Kategori}
            {t['Jenis Custom'] ? ` "${t['Jenis Custom']}"` : ''} ({t.Divisi || 'division not set'})
          </p>
        </div>
        <div className="row">
          <span className="badge outline">Ball with: {t['Bola di']}</span>
          <Sisa deadline={t.Deadline} today={today} done={done} />
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} big />
      <div className="stage-head">
        <div className="eyebrow">Current stage</div>
        <div className="stage-name">{t.Status}</div>
        <div className="stage-sub">
          {STAGE_HINT[t.Status] || ''}
          {t['Bola di'] && t['Bola di'] !== '-' ? ` Ball with: ${t['Bola di']}.` : ''}
        </div>
        <Journey pos={journeyOf(t, today)} size="lg" />
      </div>
      <MarkSeen seenKey={seenKey(t)} />

      <div className="grid grid-3">
        <div className="span-2 stack">
          {customPending ? (
            can.prioritize(user, t) ? (
              <section className="card action-card">
                <h2>Set up custom task</h2>
                <p className="muted">
                  This request uses the <b>Lainnya (custom)</b> category, so it is not routed automatically. Set the division, lead, and deadline,
                  or switch to an existing category if one fits.
                </p>
                <form action={customSetupAction} className="stack">
                  <input type="hidden" name="taskId" value={id} />
                  <div className="grid grid-2" style={{ gap: 12 }}>
                    <div className="field">
                      <label htmlFor="ckat">Category</label>
                      <select id="ckat" name="kategori" defaultValue={CUSTOM_CATEGORY}>
                        <option value={CUSTOM_CATEGORY}>Keep custom</option>
                        {[...new Set(db.master.kategori.map((k) => k.kategori))]
                          .filter((k) => k !== CUSTOM_CATEGORY)
                          .map((k) => (
                            <option key={k} value={k}>
                              Switch to: {k}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="cjenis">Work type (for reports)</label>
                      <input id="cjenis" name="jenisCustom" placeholder="E.g. Marketplace banner" maxLength={60} />
                      <span className="help">Required if kept custom. Types that appear &gt; 3x/month become candidates for a new category.</span>
                    </div>
                    <div className="field">
                      <label htmlFor="cdiv">Division</label>
                      <select id="cdiv" name="divisi" defaultValue="">
                        <option value="">Select division…</option>
                        {DIVISI.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                      <span className="help">If you switch category, the division follows that category's rules.</span>
                    </div>
                    <div className="field">
                      <label htmlFor="clead">Lead</label>
                      <select id="clead" name="lead" defaultValue="">
                        <option value="">Automatic (division & group lead)</option>
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
                    <SubmitButton>Save & send to lead</SubmitButton>
                  </div>
                </form>
              </section>
            ) : (
              <div className="flash">This custom task is waiting for Traffic to set the division, lead, and deadline.</div>
            )
          ) : null}
          {actions.includes('draft') ? (
            <section className="card action-card">
              <h2>{t.Status === STATUS.DIKERJAKAN ? 'Upload draft' : 'Upload revised draft'}</h2>
              <p className="muted">
                Save the file to Google Drive, then paste its link. The draft goes to {t.Lead} for QC before the brand.
              </p>
              {t.Status === STATUS.REVISI_INTERNAL && t['Catatan QC'] ? (
                <div className="flash err">Latest QC note: {t['Catatan QC'].split('\n').pop()}</div>
              ) : null}
              {t.Status === STATUS.REVISI_BRAND && t['Catatan Revisi'] ? (
                <div className="flash err">Brand revision: {t['Catatan Revisi'].split('\n').pop()}</div>
              ) : null}
              <form action={draftAction}>
                <input type="hidden" name="taskId" value={id} />
                <div className="field">
                  <label htmlFor="link">Draft link v{(Number(t['Versi Draft']) || 0) + 1}</label>
                  <input id="link" type="url" name="link" required placeholder="https://drive.google.com/…" />
                </div>
                {canUpload ? (
                  <ImagePicker folder={id} label="Draft preview (optional, so the lead & PIC can see it without opening Drive)" allowLink={false} canUpload>
                    <div className="field">
                      <label htmlFor="dnote">Note for the lead (optional)</label>
                      <textarea id="dnote" name="note" rows={2} placeholder="E.g. changed the background color per revision R1" />
                    </div>
                  </ImagePicker>
                ) : (
                  <div className="field">
                    <label htmlFor="dnote">Note for the lead (optional)</label>
                    <textarea id="dnote" name="note" rows={2} placeholder="E.g. changed the background color per revision R1" />
                    <span className="help">If the draft link is a shared image on Drive, its preview shows up automatically in the version list.</span>
                  </div>
                )}
                <div>
                  <SubmitButton>Send to QC</SubmitButton>
                </div>
              </form>
            </section>
          ) : null}

          {actions.includes('qc') ? (
            <section className="card action-card">
              <h2>QC draft v{t['Versi Draft']}</h2>
              <p className="muted">
                Draft: <LinkOrDash href={t['Link Draft']} /> · by {t.Assignee}
              </p>
              <form action={qcAction}>
                <input type="hidden" name="taskId" value={id} />
                <div className="field">
                  <label htmlFor="qcnote">QC note</label>
                  <textarea id="qcnote" name="note" placeholder="Required if not passed" />
                </div>
                <ImagePicker folder={id} canUpload={canUpload} label="Attachments (optional, e.g. a marked-up screenshot)" />
                <div className="actions-row">
                  <SubmitButton name="decision" value="pass" className="btn success">
                    Passed QC, send to brand
                  </SubmitButton>
                  <SubmitButton name="decision" value="fail" className="btn danger">
                    Not passed, send back
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
                The PIC can also reply via WhatsApp: <b>ACC {id}</b> or <b>REV {id} &lt;note&gt;</b>.
              </p>
              <form action={reviewAction}>
                <input type="hidden" name="taskId" value={id} />
                <div className="field">
                  <label htmlFor="revnote">Revision note</label>
                  <textarea id="revnote" name="note" placeholder="Required when requesting a revision" />
                  <span className="help">
                    Current revision round: {Number(t['Ronde Revisi']) || 0} (limit {db.master.config.maxRevisi})
                  </span>
                </div>
                <ImagePicker folder={id} canUpload={canUpload} label="Revision attachments (optional, e.g. a marked-up screenshot)" />
                <div className="actions-row">
                  <SubmitButton name="decision" value="ACC" className="btn success">
                    ACC
                  </SubmitButton>
                  <SubmitButton name="decision" value="REV" className="btn danger">
                    Request revision
                  </SubmitButton>
                </div>
              </form>
            </section>
          ) : null}

          {actions.includes('final') ? (
            <section className="card action-card">
              <h2>Upload final file</h2>
              <p className="muted">The brand has approved (ACC) the draft. Upload the final file to Drive and paste its link.</p>
              <form action={finalAction}>
                <input type="hidden" name="taskId" value={id} />
                <div className="field">
                  <label htmlFor="final">Final file link</label>
                  <input
                    id="final"
                    type="url"
                    name="link"
                    required
                    placeholder={db.master.config.driveFolderUrl || 'https://drive.google.com/…'}
                  />
                </div>
                <div>
                  <SubmitButton>Save final file</SubmitButton>
                </div>
              </form>
            </section>
          ) : null}

          {actions.includes('close') ? (
            <section className="card action-card">
              <h2>Close ticket</h2>
              <p className="muted">
                Final file: <LinkOrDash href={t['Link Final']} />
              </p>
              <form action={closeAction}>
                <input type="hidden" name="taskId" value={id} />
                <SubmitButton className="btn success">Close ticket</SubmitButton>
              </form>
            </section>
          ) : null}

          <section className="card" id="deskripsi">
            <h2 style={{ marginBottom: 10 }}>Description & work notes</h2>
            {mayEditDesc ? (
              <form action={descriptionAction} className="stack">
                <input type="hidden" name="taskId" value={id} />
                <textarea
                  name="deskripsi"
                  rows={4}
                  defaultValue={t.Deskripsi}
                  placeholder="E.g. concept used, file sizes, things to watch out for, progress…"
                />
                <div>
                  <SubmitButton className="btn small">Save description</SubmitButton>
                </div>
              </form>
            ) : t.Deskripsi ? (
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{t.Deskripsi}</p>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No description yet. The assignee or lead can add one.
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
                  <dt>Title</dt>
                  <dd>{taskTitle(t, r)}</dd>
                  <dt>Campaign</dt>
                  <dd>
                    {r['Campaign Name']} <span className="subtle">({r['Campaign Type']})</span>
                  </dd>
                  <dt>Sub-type</dt>
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
                  <dt>References</dt>
                  <dd>
                    <LinkOrDash href={r['Supporting Link']} /> <LinkOrDash href={r.Attachments} />
                  </dd>
                </dl>
              ) : (
                <p className="muted">Parent request not found.</p>
              )
            }
            form={
              r ? (
                <form action={editBriefAction} className="stack">
                  <input type="hidden" name="taskId" value={id} />
                  <div className="field">
                    <label htmlFor="eb-judul">Title (this task only)</label>
                    <input id="eb-judul" name="judul" defaultValue={taskTitle(t, r)} maxLength={120} required />
                  </div>
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
                      <span className="label">Sub-type {t.Kategori}</span>
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
                              <option value="">Select…</option>
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
                    <SubmitButton>Save brief</SubmitButton>
                    <CancelEdit />
                  </div>
                  <span className="help">Changes apply to request {r['Request ID']}, are recorded in the history, and the task team is notified via WhatsApp.</span>
                </form>
              ) : null
            }
          />



          <EditableSection
            key={`draft-${sp.ok || ''}`}
            id="draft"
            title=<>
                Draft ({versionList.length} versions){' '}
                {t['Link Final'] ? (
                  <span className="badge green" style={{ marginLeft: 6 }}>
                    Final available
                  </span>
                ) : null}
              </>
            editLabel="Change latest draft link"
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
                        v{v.v} {v.v === String(Number(t['Versi Draft']) || 0) ? <span className="badge blue">latest</span> : null}
                      </b>
                      <span className="subtle">{formatWaktu(v.ts)}</span>
                      <a href={v.link} target="_blank" rel="noreferrer">
                        Open file
                      </a>
                      {v.previews.length > 1 ? <span className="subtle">+{v.previews.length - 1} preview</span> : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No drafts yet.
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
                  <label htmlFor="ed-link">Draft link v{Number(t['Versi Draft']) || 0}</label>
                  <input id="ed-link" name="link" type="url" required defaultValue={t['Link Draft']} />
                  <span className="help">For fixing a wrongly pasted link. To send a new version, use Upload draft.</span>
                </div>
                <div className="actions-row">
                  <SubmitButton>Save link</SubmitButton>
                  <CancelEdit />
                </div>
              </form>
            }
          />

          <section className="card">
            <h2 style={{ marginBottom: 10 }}>QC notes & brand revisions ({Number(t['Ronde Revisi']) || 0} rounds)</h2>
            {qcRev.length ? (
              <ul className="comments">
                {[...qcRev].reverse().map((k) => (
                  <li key={k['Komentar ID']} className={`comment ${JENIS_CLASS[k.Jenis] || ''}`}>
                    <div className="comment-head">
                      <span className={`badge ${JENIS_BADGE[k.Jenis] || ''}`}>{jenisLabel(k.Jenis)}</span>
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
            <h2 style={{ marginBottom: 10 }}>Comments ({komentar.length})</h2>
            {komentar.length ? (
              <ul className="comments">
                {komentar.map((k) => (
                  <li key={k['Komentar ID']} className={`comment ${JENIS_CLASS[k.Jenis] || ''}`}>
                    <div className="comment-head">
                      <b>{k.Oleh}</b>
                      <span className="subtle">{k.Peran}</span>
                      <span className={`badge ${JENIS_BADGE[k.Jenis] || ''}`}>{k.Jenis === 'Draft' ? `Draft v${k.Versi}` : jenisLabel(k.Jenis)}</span>
                      <span className="subtle" style={{ marginLeft: 'auto' }}>
                        {k.Jenis !== 'Draft' && Number(k.Versi) > 0 ? `for v${k.Versi} · ` : ''}
                        {formatWaktu(k.Timestamp)}
                      </span>
                    </div>
                    {k.Isi ? <p className="comment-body">{k.Isi}</p> : null}
                    <Thumbs urls={lampiranOf(k.Lampiran)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No comments yet.</p>
            )}
            {mayComment ? (
              <form action={commentAction} key={komentar.length} className="stack" style={{ marginTop: 14 }}>
                <input type="hidden" name="taskId" value={id} />
                <ImagePicker folder={id} canUpload={canUpload}>
                  <div className="field">
                    <label htmlFor="isi">Write a comment</label>
                    <textarea
                      id="isi"
                      name="isi"
                      rows={3}
                      placeholder={canUpload ? 'Write a comment… (you can paste a screenshot with Ctrl/Cmd + V)' : 'Write a comment…'}
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
                            {jenisLabel(j)}
                            {j === 'Revisi brand' ? ' (revision round +1)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <input type="hidden" name="jenis" value="Catatan" />
                  )}
                  {Number(t['Versi Draft']) > 0 ? (
                    <div className="field" style={{ minWidth: 130 }}>
                      <label htmlFor="versi">For draft</label>
                      <select id="versi" name="versi" defaultValue={String(Number(t['Versi Draft']))}>
                        {Array.from({ length: Number(t['Versi Draft']) }, (_, i) => Number(t['Versi Draft']) - i).map((v) => (
                          <option key={v} value={v}>
                            v{v}
                            {v === Number(t['Versi Draft']) ? ' (latest)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <SubmitButton pendingText="Sending…">Send comment</SubmitButton>
                </div>
                <span className="help">
                  The Brand revision label always applies to the latest draft. The ball holder ({t['Bola di']}) is notified via WhatsApp.
                </span>
              </form>
            ) : null}
          </section>
        </div>

        <div className="stack">
          <EditableSection
            key={`detail-${sp.ok || ''}`}
            id="detail"
            title="Detail"
            editLabel="Edit"
            canEdit={mayEditDetail}
            view={
              <dl className="kv" style={{ gridTemplateColumns: '110px minmax(0,1fr)' }}>
                <dt>PIC brand</dt>
                <dd>{t['PIC Brand']}</dd>
                <dt>Lead</dt>
                <dd>{t.Lead || '-'}</dd>
                <dt>Assignee</dt>
                <dd>{t.Assignee || 'Unassigned'}</dd>
                <dt>Target draft</dt>
                <dd>{formatTanggal(t['Target Draft'])}</dd>
                <dt>Deadline</dt>
                <dd>{formatTanggal(t.Deadline)}</dd>
                <dt>Status since</dt>
                <dd>{formatWaktu(t['Status Sejak'])}</dd>
                {t['Selesai Pada'] ? (
                  <>
                    <dt>Final at</dt>
                    <dd>{formatWaktu(t['Selesai Pada'])}</dd>
                  </>
                ) : null}
              </dl>
            }
            form={
              <form action={editDetailAction} className="stack">
                <input type="hidden" name="taskId" value={id} />
                <div className="field">
                  <label htmlFor="ed-pic">PIC brand</label>
                  <select id="ed-pic" name="pic" defaultValue={t['PIC Brand']} required>
                    {picOptions.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ed-lead">Lead</label>
                  <select id="ed-lead" name="lead" defaultValue={t.Lead} required>
                    {teamOptions.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ed-assignee">Assignee</label>
                  <select id="ed-assignee" name="assignee" defaultValue={t.Assignee}>
                    <option value="">Unassigned</option>
                    {teamOptions.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ed-target">Target draft</label>
                  <input id="ed-target" type="date" name="targetDraft" defaultValue={t['Target Draft'].slice(0, 10)} />
                </div>
                <div className="field">
                  <label htmlFor="ed-deadline">Deadline</label>
                  <input id="ed-deadline" type="date" name="deadline" defaultValue={t.Deadline.slice(0, 10)} />
                </div>
                <div className="field">
                  <label htmlFor="ed-final">Final at</label>
                  <input id="ed-final" type="datetime-local" name="selesaiPada" defaultValue={t['Selesai Pada'].replace(' ', 'T').slice(0, 16)} />
                </div>
                <div className="actions-row">
                  <SubmitButton>Save</SubmitButton>
                  <CancelEdit />
                </div>
                <span className="help">The task stays {t.Status}. Every change is recorded in the status history (who, when, which field).</span>
              </form>
            }
          />

          {actions.includes('assign') ? (
            <section className="card">
              <h2>{t.Assignee ? 'Change assignee' : 'Assign member'}</h2>
              <form action={assignAction} className="stack" style={{ marginTop: 10 }}>
                <input type="hidden" name="taskId" value={id} />
                <AssigneePicker options={assigneeOptions} current={t.Assignee} />
                <SubmitButton className="btn primary block">{t.Assignee ? 'Change' : 'Assign'}</SubmitButton>
              </form>
            </section>
          ) : null}

          {actions.includes('priority') ? (
            <section className="card">
              <h2>Priority & deadline</h2>
              <form action={priorityAction} className="stack" style={{ marginTop: 10 }}>
                <input type="hidden" name="taskId" value={id} />
                <div className="field">
                  <label htmlFor="pdeadline">Deadline</label>
                  <input id="pdeadline" type="date" name="deadline" defaultValue={t.Deadline} required />
                </div>
                <div className="field">
                  <label htmlFor="purgent">Priority</label>
                  <select id="purgent" name="urgent" defaultValue={t.Urgent === 'Ya' ? 'Ya' : 'Tidak'}>
                    <option value="Tidak">Normal</option>
                    <option value="Ya">URGENT</option>
                  </select>
                </div>
                <SubmitButton className="btn block">Save</SubmitButton>
              </form>
            </section>
          ) : null}

          {actions.includes('override') ? (
            <section className="card">
              <h2>Status correction (admin)</h2>
              <form action={overrideAction} className="stack" style={{ marginTop: 10 }}>
                <input type="hidden" name="taskId" value={id} />
                <select name="status" defaultValue={t.Status}>
                  {TASK_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <input type="text" name="note" placeholder="Reason (required)" required />
                <SubmitButton className="btn danger block">Force status</SubmitButton>
              </form>
            </section>
          ) : null}

          {mayArchive ? (
            <section className="card danger-zone">
              <h2>Delete task</h2>
              <p className="muted" style={{ marginTop: 4 }}>
                For tasks entered by mistake or no longer needed. The task disappears from the Tracker, Dashboard, and reminders; an admin
                can restore it from the Deleted tab in the Tracker.
              </p>
              <form action={archiveTaskAction} className="stack" style={{ marginTop: 10 }}>
                <input type="hidden" name="taskId" value={id} />
                <input type="hidden" name="back" value="/tracker" />
                <input type="text" name="reason" placeholder="Reason (optional)" maxLength={200} />
                <ConfirmButton className="btn danger block" confirm={`Delete ${id}? It will be moved to the archive.`}>
                  Delete task
                </ConfirmButton>
              </form>
            </section>
          ) : null}

          <section className="card">
            <h2 style={{ marginBottom: 10 }}>Status history</h2>
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
            <h2 style={{ marginBottom: 10 }}>WhatsApp notifications</h2>
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
              <p className="muted">No messages yet.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
