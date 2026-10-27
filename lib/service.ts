/**
 * Aksi-aksi bisnis: setiap fungsi membaca data terbaru, memvalidasi hak akses
 * dan alur status, menulis perubahan, mencatat log status, lalu mengirim WA.
 */
import {
  CATEGORIES,
  REQUEST_STATUS,
  SHEETS,
  STATUS,
  type RequestRow,
  type Status,
  type TaskRow,
} from './config';
import { now } from './clock';
import { addWorkingDays, formatWib, isYmd, todayWib } from './dates';
import { findRequest, findTask, loadDb, tasksOf, type Db } from './db';
import { findPerson, type Master } from './master';
import { msg } from './messages';
import { Notifier } from './notify';
import { buildTaskDrafts, isUrgent, nextTicketId, routeRequest } from './routing';
import type { Cell, Store } from './store';
import { ballHolder, can, canTransition, type CurrentUser } from './workflow';

export interface ActionResult {
  ok: boolean;
  message: string;
  id?: string;
}

const fail = (message: string): ActionResult => ({ ok: false, message });
const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(String(s || '').trim());

class Tx {
  logs: Record<string, Cell>[] = [];
  readonly ts: string;
  readonly today: string;
  readonly notify: Notifier;

  constructor(
    readonly store: Store,
    readonly db: Db,
    readonly by: string,
  ) {
    const n = now();
    this.ts = formatWib(n);
    this.today = todayWib(n);
    this.notify = new Notifier(db.master);
  }

  log(id: string, level: 'Request' | 'Task', from: string, to: string, note = '') {
    this.logs.push({ Timestamp: this.ts, ID: id, Level: level, Dari: from, Ke: to, Oleh: this.by, Catatan: note });
  }

  async commit() {
    if (this.logs.length) await this.store.append(SHEETS.STATUS_LOG, this.logs);
    await this.notify.flush(this.store);
  }
}

function trafficOf(db: Db, t: Pick<TaskRow, 'Request ID'>): string {
  return findRequest(db, t['Request ID'])?.Traffic || '';
}

/** Patch kolom untuk perpindahan status task. */
function statusPatch(tx: Tx, t: TaskRow, to: Status, extra: Partial<TaskRow> = {}): Record<string, Cell> {
  const merged = { ...t, ...extra };
  const patch: Record<string, Cell> = {
    ...extra,
    Status: to,
    'Bola di': ballHolder(to, merged, trafficOf(tx.db, t)),
    'Status Sejak': tx.ts,
  };
  if (to === STATUS.FINAL) patch['Selesai Pada'] = tx.ts;
  return patch;
}

function appendNote(existing: string, line: string): string {
  return existing ? `${existing}\n${line}` : line;
}

// ---------------------------------------------------------------------------
// 1. Pengajuan request
// ---------------------------------------------------------------------------

export interface RequestInput {
  brand: string;
  picName?: string;
  campaignName: string;
  campaignType: string;
  objective: string;
  kategori: string[];
  subJenis: Record<string, string[]>;
  details: Record<string, Record<string, string>>;
  usp: string;
  keyMessage: string;
  creativeNote: string;
  targetAudience: string;
  budget: string;
  dueDate: string;
  deliverables: string;
  supportingLink: string;
  attachments: string;
}

export function validateRequestInput(input: RequestInput, master: Master, today: string): Record<string, string> {
  const errors: Record<string, string> = {};
  const req = (key: keyof RequestInput, label: string) => {
    const v = input[key];
    if (Array.isArray(v) ? v.length === 0 : !String(v || '').trim()) errors[key] = `${label} wajib diisi`;
  };
  req('brand', 'Brand');
  req('campaignName', 'Campaign Name');
  req('campaignType', 'Campaign Type');
  req('objective', 'Objective');
  req('kategori', 'Kategori');
  req('usp', 'Product Knowledge/USP');
  req('keyMessage', 'Key Message');
  req('creativeNote', 'Creative Note');
  req('targetAudience', 'Target Audience');
  req('budget', 'Budget');
  req('dueDate', 'Due Date');
  req('deliverables', 'Deliverables');

  if (input.brand && !master.brands.some((b) => b.active && b.name === input.brand)) errors.brand = 'Brand tidak dikenal';
  if (input.dueDate) {
    if (!isYmd(input.dueDate)) errors.dueDate = 'Format tanggal tidak valid';
    else if (input.dueDate < today) errors.dueDate = 'Due date tidak boleh di masa lalu';
  }
  if (input.budget && !/^\d+$/.test(String(input.budget).replace(/[.\s]/g, ''))) errors.budget = 'Budget harus berupa angka (Rp)';
  if (input.supportingLink && !isUrl(input.supportingLink)) errors.supportingLink = 'Link harus diawali http:// atau https://';

  for (const k of input.kategori || []) {
    const def = CATEGORIES.find((c) => c.name === k);
    if (!def || !master.kategori.some((r) => r.kategori === k)) {
      errors.kategori = `Kategori "${k}" tidak dikenal`;
      continue;
    }
    if (!(input.subJenis[k] || []).length) errors[`sub:${k}`] = `Pilih minimal satu sub-jenis ${k}`;
    for (const f of def.fields) {
      const v = String(input.details[k]?.[f.key] ?? '').trim();
      if (f.required && !v) errors[`detail:${k}:${f.key}`] = `${f.label} wajib diisi`;
      if (v && f.type === 'number' && !(Number(v) > 0)) errors[`detail:${k}:${f.key}`] = `${f.label} harus angka > 0`;
    }
  }
  return errors;
}

export function formatDetails(input: Pick<RequestInput, 'kategori' | 'details'>): string {
  return input.kategori
    .map((k) => {
      const def = CATEGORIES.find((c) => c.name === k);
      const parts = (def?.fields || [])
        .map((f) => [f.label, String(input.details[k]?.[f.key] ?? '').trim()] as const)
        .filter(([, v]) => v)
        .map(([l, v]) => `${l}: ${v}`);
      return `${k} — ${parts.join('; ') || '-'}`;
    })
    .join('\n');
}

export async function submitRequest(
  store: Store,
  user: CurrentUser,
  input: RequestInput,
): Promise<ActionResult & { errors?: Record<string, string> }> {
  if (!can.submitRequest(user)) return fail('Akunmu belum terdaftar sebagai PIC brand atau Traffic.');
  const db = await loadDb(store, { fresh: true });
  const tx = new Tx(store, db, user.name);
  const { master } = db;

  const errors = validateRequestInput(input, master, tx.today);
  const picName = String(input.picName || '').trim() || (user.roles.includes('pic') ? user.name : '');
  const pic = findPerson(master, picName);
  if (!pic || !pic.roles.includes('pic')) errors.picName = 'Pilih PIC brand';
  if (Object.keys(errors).length) return { ok: false, message: 'Periksa kembali isian form.', errors };

  const route = routeRequest(master, input.brand, input.kategori);
  const urgent = isUrgent(tx.today, input.dueDate, route.leadTimeMin, master.holidays);
  const id = nextTicketId(
    master.config.ticketPrefix,
    tx.today,
    db.requests.map((r) => r['Request ID']),
  );
  const subJenis = input.kategori.flatMap((k) => (input.subJenis[k] || []).map((s) => `${s}`));

  const row: Record<string, Cell> = {
    'Request ID': id,
    Timestamp: tx.ts,
    Brand: input.brand,
    Grup: route.grup,
    'PIC Brand': pic!.name,
    'Email Requestor': user.email,
    'Campaign Name': input.campaignName.trim(),
    'Campaign Type': input.campaignType,
    Kategori: input.kategori.join(', '),
    'Sub-jenis': subJenis.join(', '),
    Objective: input.objective.trim(),
    'Product Knowledge/USP': input.usp.trim(),
    'Key Message': input.keyMessage.trim(),
    'Creative Note': input.creativeNote.trim(),
    'Target Audience': input.targetAudience.trim(),
    Budget: Number(String(input.budget).replace(/[.\s]/g, '')) || 0,
    'Due Date': input.dueDate,
    Deliverables: input.deliverables.trim(),
    'Detail Kategori': formatDetails(input),
    'Supporting Link': input.supportingLink.trim(),
    Attachments: input.attachments.trim(),
    Traffic: route.traffic,
    'Creative Head': route.creativeHead,
    'Lead Time Min (hari kerja)': route.leadTimeMin,
    Urgent: urgent ? 'Ya' : 'Tidak',
    Deadline: input.dueDate,
    'Cek Brief': '',
    'Catatan Traffic': '',
    Status: REQUEST_STATUS.BARU,
    'Status Sejak': tx.ts,
    'Brief OK Pada': '',
    'Selesai Pada': '',
  };
  await store.append(SHEETS.REQUEST, [row]);
  tx.log(id, 'Request', '', STATUS.BARU, 'Request diajukan');

  const r = row as unknown as RequestRow;
  tx.notify.to(pic!.name, 'Request diterima', id, msg.requestReceived(r));
  tx.notify.to(route.traffic, 'Request baru', id, msg.newRequestTraffic(r));
  if (urgent) tx.notify.to(route.creativeHead, 'Request URGENT', id, msg.urgentHead(r));
  await tx.commit();
  return { ok: true, message: `Request ${id} terkirim.`, id };
}

// ---------------------------------------------------------------------------
// 2. Cek brief oleh Traffic → routing → task per divisi
// ---------------------------------------------------------------------------

export async function cekBrief(
  store: Store,
  user: CurrentUser,
  p: { requestId: string; decision: 'Lengkap' | 'Kurang'; note: string; deadline?: string },
): Promise<ActionResult> {
  const db = await loadDb(store, { fresh: true });
  const r = findRequest(db, p.requestId);
  if (!r) return fail('Request tidak ditemukan.');
  if (!can.cekBrief(user, r)) return fail('Hanya Traffic grup ini yang bisa mengecek brief.');
  if (r.Status !== REQUEST_STATUS.BARU && r.Status !== REQUEST_STATUS.BRIEF_KURANG)
    return fail(`Request sudah berstatus ${r.Status}.`);
  if (tasksOf(db, r['Request ID']).length) return fail('Task untuk request ini sudah dibuat.');

  const tx = new Tx(store, db, user.name);
  const { master } = db;

  if (p.decision === 'Kurang') {
    if (!p.note.trim()) return fail('Tulis apa yang perlu dilengkapi PIC.');
    await store.update(SHEETS.REQUEST, 'Request ID', [
      {
        key: r['Request ID'],
        patch: { 'Cek Brief': 'Kurang', 'Catatan Traffic': p.note.trim(), Status: REQUEST_STATUS.BRIEF_KURANG, 'Status Sejak': tx.ts },
      },
    ]);
    tx.log(r['Request ID'], 'Request', r.Status, STATUS.BRIEF_KURANG, p.note.trim());
    tx.notify.to(r['PIC Brand'], 'Brief kurang', r['Request ID'], msg.briefKurang(r, p.note.trim()));
    await tx.commit();
    return { ok: true, message: 'Brief dikembalikan ke PIC brand.' };
  }

  const deadline = (p.deadline || r.Deadline || r['Due Date']).slice(0, 10);
  if (!isYmd(deadline)) return fail('Deadline tidak valid.');
  if (deadline < tx.today) return fail('Deadline tidak boleh di masa lalu.');

  const kategoriList = r.Kategori.split(',').map((s) => s.trim()).filter(Boolean);
  const route = routeRequest(master, r.Brand, kategoriList);
  const urgent = isUrgent(tx.today, deadline, route.leadTimeMin, master.holidays);
  const drafts = buildTaskDrafts({
    master,
    grup: r.Grup,
    kategoriList,
    deadline,
    today: tx.today,
    existingTasks: db.tasks,
  });
  if (!drafts.length) return fail('Tidak ada aturan routing untuk kategori ini. Cek sheet Master_Kategori.');

  const subByKategori = (k: string) => {
    const def = CATEGORIES.find((c) => c.name === k);
    const chosen = r['Sub-jenis'].split(',').map((s) => s.trim());
    return chosen.filter((s) => def?.subTypes.includes(s)).join(', ');
  };

  const newTasks: TaskRow[] = drafts.map((d, i) => {
    const t = {
      'Task ID': `${r['Request ID']}-${i + 1}`,
      'Request ID': r['Request ID'],
      Dibuat: tx.ts,
      Brand: r.Brand,
      Grup: r.Grup,
      'PIC Brand': r['PIC Brand'],
      Kategori: d.kategori,
      'Sub-jenis': subByKategori(d.kategori),
      Divisi: d.divisi,
      Lead: d.lead,
      Assignee: d.assignee,
      Status: d.assignee ? STATUS.DIKERJAKAN : STATUS.SIAP_ASSIGN,
      'Bola di': '',
      Deadline: d.deadline,
      'Target Draft': d.targetDraft,
      Urgent: urgent ? 'Ya' : 'Tidak',
      'Versi Draft': '0',
      'Link Draft': '',
      'Riwayat Draft': '',
      'Catatan QC': '',
      'Ronde Revisi': '0',
      'Catatan Revisi': '',
      'Link Final': '',
      'Status Sejak': tx.ts,
      'Selesai Pada': '',
      'Reminder Terkirim': '',
      _row: 0,
    } as TaskRow;
    t['Bola di'] = ballHolder(t.Status, t, r.Traffic);
    return t;
  });

  await store.append(
    SHEETS.TASK,
    newTasks.map(({ _row, ...t }) => t),
  );
  await store.update(SHEETS.REQUEST, 'Request ID', [
    {
      key: r['Request ID'],
      patch: {
        'Cek Brief': 'Lengkap',
        'Catatan Traffic': p.note.trim(),
        Status: REQUEST_STATUS.DIPROSES,
        'Status Sejak': tx.ts,
        'Brief OK Pada': tx.ts,
        Deadline: deadline,
        Urgent: urgent ? 'Ya' : 'Tidak',
        'Lead Time Min (hari kerja)': route.leadTimeMin,
      },
    },
  ]);
  tx.log(r['Request ID'], 'Request', r.Status, REQUEST_STATUS.DIPROSES, p.note.trim() || 'Brief lengkap');

  for (const t of newTasks) {
    tx.log(t['Task ID'], 'Task', '', STATUS.SIAP_ASSIGN, `Routing ke ${t.Divisi} (lead ${t.Lead})`);
    if (t.Assignee) tx.log(t['Task ID'], 'Task', STATUS.SIAP_ASSIGN, STATUS.DIKERJAKAN, `Auto-assign ke ${t.Assignee}`);
    tx.notify.to(t.Lead, 'Task baru', t['Task ID'], msg.newTaskLead(t, r));
    if (t.Assignee) tx.notify.to(t.Assignee, 'Tugas baru', t['Task ID'], msg.taskAssigned(t, r));
  }
  await tx.commit();
  return { ok: true, message: `Brief lengkap. ${newTasks.length} task dibuat dan dikirim ke lead divisi.` };
}

/** PIC melengkapi brief yang dikembalikan Traffic. */
export async function updateBrief(
  store: Store,
  user: CurrentUser,
  requestId: string,
  input: RequestInput,
): Promise<ActionResult & { errors?: Record<string, string> }> {
  const db = await loadDb(store, { fresh: true });
  const r = findRequest(db, requestId);
  if (!r) return fail('Request tidak ditemukan.');
  if (!can.editBrief(user, r)) return fail('Kamu tidak punya akses mengubah brief ini.');
  if (r.Status !== REQUEST_STATUS.BRIEF_KURANG && r.Status !== REQUEST_STATUS.BARU)
    return fail('Brief hanya bisa diubah sebelum diproses tim creative.');

  const tx = new Tx(store, db, user.name);
  const errors = validateRequestInput({ ...input, brand: r.Brand }, db.master, tx.today);
  delete errors.brand;
  if (Object.keys(errors).length) return { ok: false, message: 'Periksa kembali isian form.', errors };

  const route = routeRequest(db.master, r.Brand, input.kategori);
  const urgent = isUrgent(tx.today, input.dueDate, route.leadTimeMin, db.master.holidays);
  const patch: Record<string, Cell> = {
    'Campaign Name': input.campaignName.trim(),
    'Campaign Type': input.campaignType,
    Kategori: input.kategori.join(', '),
    'Sub-jenis': input.kategori.flatMap((k) => input.subJenis[k] || []).join(', '),
    Objective: input.objective.trim(),
    'Product Knowledge/USP': input.usp.trim(),
    'Key Message': input.keyMessage.trim(),
    'Creative Note': input.creativeNote.trim(),
    'Target Audience': input.targetAudience.trim(),
    Budget: Number(String(input.budget).replace(/[.\s]/g, '')) || 0,
    'Due Date': input.dueDate,
    Deadline: input.dueDate,
    Deliverables: input.deliverables.trim(),
    'Detail Kategori': formatDetails(input),
    'Supporting Link': input.supportingLink.trim(),
    Attachments: input.attachments.trim(),
    'Lead Time Min (hari kerja)': route.leadTimeMin,
    Urgent: urgent ? 'Ya' : 'Tidak',
  };
  const wasKurang = r.Status === REQUEST_STATUS.BRIEF_KURANG;
  if (wasKurang) Object.assign(patch, { Status: REQUEST_STATUS.BARU, 'Cek Brief': '', 'Status Sejak': tx.ts });
  await store.update(SHEETS.REQUEST, 'Request ID', [{ key: requestId, patch }]);
  if (wasKurang) {
    tx.log(requestId, 'Request', STATUS.BRIEF_KURANG, STATUS.BARU, 'Brief dilengkapi PIC');
    tx.notify.to(r.Traffic, 'Brief dilengkapi', requestId, msg.briefResubmitted({ ...r, ...(patch as Partial<RequestRow>) }));
  }
  await tx.commit();
  return { ok: true, message: wasKurang ? 'Brief dikirim ulang ke Traffic.' : 'Brief diperbarui.', id: requestId };
}

// ---------------------------------------------------------------------------
// 3. Produksi: assign, draft, QC, review brand, final, tutup
// ---------------------------------------------------------------------------

async function withTask(
  store: Store,
  user: CurrentUser,
  taskId: string,
  fn: (tx: Tx, t: TaskRow, r: RequestRow) => Promise<ActionResult> | ActionResult,
): Promise<ActionResult> {
  const db = await loadDb(store, { fresh: true });
  const t = findTask(db, taskId);
  if (!t) return fail('Task tidak ditemukan.');
  const r = findRequest(db, t['Request ID']);
  if (!r) return fail('Request induk tidak ditemukan.');
  const tx = new Tx(store, db, user.name);
  const result = await fn(tx, t, r);
  if (result.ok) await tx.commit();
  return result;
}

async function writeTask(tx: Tx, taskId: string, patch: Record<string, Cell>) {
  await tx.store.update(SHEETS.TASK, 'Task ID', [{ key: taskId, patch }]);
}

function requireStatus(t: TaskRow, ...allowed: Status[]): ActionResult | null {
  return allowed.includes(t.Status as Status) ? null : fail(`Aksi ini tidak bisa dilakukan saat status ${t.Status}.`);
}

export async function assignTask(store: Store, user: CurrentUser, taskId: string, assignee: string): Promise<ActionResult> {
  return withTask(store, user, taskId, async (tx, t, r) => {
    if (!can.assign(user, t)) return fail('Hanya lead divisi atau Creative Head yang bisa meng-assign.');
    if (t.Status === STATUS.FINAL || t.Status === STATUS.SELESAI) return fail('Task sudah final.');
    const person = findPerson(tx.db.master, assignee);
    if (!person || !person.active) return fail('Anggota tidak ditemukan atau tidak aktif.');
    if (person.name === t.Assignee) return fail(`${person.name} sudah menjadi assignee.`);

    const updated = { ...t, Assignee: person.name };
    if (t.Status === STATUS.SIAP_ASSIGN) {
      if (!canTransition(t.Status, STATUS.DIKERJAKAN)) return fail('Transisi tidak valid.');
      await writeTask(tx, taskId, statusPatch(tx, t, STATUS.DIKERJAKAN, { Assignee: person.name }));
      tx.log(taskId, 'Task', t.Status, STATUS.DIKERJAKAN, `Assign ke ${person.name}`);
    } else {
      await writeTask(tx, taskId, { Assignee: person.name, 'Bola di': ballHolder(t.Status, updated, r.Traffic) });
      tx.log(taskId, 'Task', t.Status, t.Status, `Assignee diganti: ${t.Assignee || '-'} → ${person.name}`);
    }
    tx.notify.to(person.name, 'Tugas baru', taskId, msg.taskAssigned({ ...updated, Status: STATUS.DIKERJAKAN }, r));
    return { ok: true, message: `Task di-assign ke ${person.name}.` };
  });
}

export async function submitDraft(store: Store, user: CurrentUser, taskId: string, link: string): Promise<ActionResult> {
  return withTask(store, user, taskId, async (tx, t) => {
    if (!can.work(user, t)) return fail('Hanya assignee atau lead yang bisa upload draft.');
    const bad = requireStatus(t, STATUS.DIKERJAKAN, STATUS.REVISI_INTERNAL, STATUS.REVISI_BRAND);
    if (bad) return bad;
    if (!isUrl(link)) return fail('Link draft harus diawali http:// atau https://');
    const versi = (Number(t['Versi Draft']) || 0) + 1;
    const extra = {
      'Versi Draft': String(versi),
      'Link Draft': link.trim(),
      'Riwayat Draft': appendNote(t['Riwayat Draft'], `v${versi} (${tx.ts}): ${link.trim()}`),
    };
    await writeTask(tx, taskId, statusPatch(tx, t, STATUS.QC_LEAD, extra));
    tx.log(taskId, 'Task', t.Status, STATUS.QC_LEAD, `Draft v${versi}`);
    tx.notify.to(t.Lead, 'Draft menunggu QC', taskId, msg.draftForQc({ ...t, ...extra }));
    return { ok: true, message: `Draft v${versi} terkirim ke ${t.Lead} untuk QC.` };
  });
}

export async function qcDecision(
  store: Store,
  user: CurrentUser,
  taskId: string,
  pass: boolean,
  note: string,
): Promise<ActionResult> {
  return withTask(store, user, taskId, async (tx, t, r) => {
    if (!can.qc(user, t)) return fail('Hanya lead divisi yang bisa QC.');
    const bad = requireStatus(t, STATUS.QC_LEAD);
    if (bad) return bad;
    if (pass) {
      const extra = note.trim() ? { 'Catatan QC': appendNote(t['Catatan QC'], `v${t['Versi Draft']} lolos (${tx.ts}): ${note.trim()}`) } : {};
      await writeTask(tx, taskId, statusPatch(tx, t, STATUS.REVIEW_BRAND, extra));
      tx.log(taskId, 'Task', t.Status, STATUS.REVIEW_BRAND, note.trim() || 'Lolos QC');
      tx.notify.to(t['PIC Brand'], 'Draft siap review', taskId, msg.reviewToPic(t, r));
      return { ok: true, message: `Draft lolos QC dan dikirim ke PIC ${t['PIC Brand']}.` };
    }
    if (!note.trim()) return fail('Tulis catatan QC agar assignee tahu apa yang diperbaiki.');
    const extra = { 'Catatan QC': appendNote(t['Catatan QC'], `v${t['Versi Draft']} belum lolos (${tx.ts}): ${note.trim()}`) };
    await writeTask(tx, taskId, statusPatch(tx, t, STATUS.REVISI_INTERNAL, extra));
    tx.log(taskId, 'Task', t.Status, STATUS.REVISI_INTERNAL, note.trim());
    tx.notify.to(t.Assignee, 'QC belum lolos', taskId, msg.qcFailed(t, note.trim()));
    return { ok: true, message: 'Draft dikembalikan ke assignee.' };
  });
}

export async function brandReview(
  store: Store,
  user: CurrentUser,
  taskId: string,
  action: 'ACC' | 'REV',
  note: string,
  via: 'web' | 'WA' = 'web',
): Promise<ActionResult> {
  return withTask(store, user, taskId, async (tx, t, r) => {
    if (!can.review(user, t)) return fail(`Hanya PIC brand (${t['PIC Brand']}) atau Traffic yang bisa review.`);
    const bad = requireStatus(t, STATUS.REVIEW_BRAND);
    if (bad) return bad;
    if (action === 'ACC') {
      await writeTask(tx, taskId, statusPatch(tx, t, STATUS.ACC));
      tx.log(taskId, 'Task', t.Status, STATUS.ACC, `ACC via ${via}${note.trim() ? `: ${note.trim()}` : ''}`);
      tx.notify.toMany([t.Assignee, t.Lead], 'Draft ACC', taskId, msg.accToAssignee(t));
      return { ok: true, message: `${taskId} di-ACC. Assignee diminta upload file final.` };
    }
    if (!note.trim()) return fail('Tulis catatan revisi.');
    const max = tx.db.master.config.maxRevisi;
    const ronde = (Number(t['Ronde Revisi']) || 0) + 1;
    const extra = {
      'Ronde Revisi': String(ronde),
      'Catatan Revisi': appendNote(t['Catatan Revisi'], `R${ronde} (${tx.ts}, ${user.name} via ${via}): ${note.trim()}`),
    };
    await writeTask(tx, taskId, statusPatch(tx, t, STATUS.REVISI_BRAND, extra));
    tx.log(taskId, 'Task', t.Status, STATUS.REVISI_BRAND, `R${ronde} via ${via}: ${note.trim()}`);
    tx.notify.toMany([t.Assignee, t.Lead], 'Revisi brand', taskId, msg.revisionToTeam(t, note.trim(), ronde));
    if (ronde > max) tx.notify.toMany([r.Traffic, r['Creative Head']], 'Revisi lewat batas', taskId, msg.revisionLimit(t, ronde, max));
    return {
      ok: true,
      message: `Revisi ronde ${ronde} dicatat${ronde > max ? ` (melewati batas ${max} ronde, Traffic & Creative Head diberi tahu)` : ''}.`,
    };
  });
}

export async function submitFinal(store: Store, user: CurrentUser, taskId: string, link: string): Promise<ActionResult> {
  return withTask(store, user, taskId, async (tx, t, r) => {
    if (!can.work(user, t)) return fail('Hanya assignee atau lead yang bisa upload file final.');
    const bad = requireStatus(t, STATUS.ACC);
    if (bad) return bad;
    if (!isUrl(link)) return fail('Link file final harus diawali http:// atau https://');
    const extra = { 'Link Final': link.trim() };
    await writeTask(tx, taskId, statusPatch(tx, t, STATUS.FINAL, extra));
    tx.log(taskId, 'Task', t.Status, STATUS.FINAL, 'File final diupload');
    tx.notify.to(t['PIC Brand'], 'File final', taskId, msg.finalToPic({ ...t, ...extra }));
    tx.notify.to(r.Traffic, 'File final', taskId, msg.finalToTraffic({ ...t, ...extra }));
    return { ok: true, message: 'File final tersimpan. Traffic akan menutup tiket.' };
  });
}

export async function closeTask(store: Store, user: CurrentUser, taskId: string): Promise<ActionResult> {
  return withTask(store, user, taskId, async (tx, t, r) => {
    if (!can.close(user, t)) return fail('Hanya Traffic atau Creative Head yang bisa menutup tiket.');
    const bad = requireStatus(t, STATUS.FINAL);
    if (bad) return bad;
    await writeTask(tx, taskId, { Status: STATUS.SELESAI, 'Bola di': '-', 'Status Sejak': tx.ts });
    tx.log(taskId, 'Task', t.Status, STATUS.SELESAI, 'Tiket ditutup');
    const siblings = tasksOf(tx.db, r['Request ID']).filter((x) => x['Task ID'] !== taskId);
    if (siblings.every((x) => x.Status === STATUS.SELESAI)) {
      await tx.store.update(SHEETS.REQUEST, 'Request ID', [
        { key: r['Request ID'], patch: { Status: REQUEST_STATUS.SELESAI, 'Status Sejak': tx.ts, 'Selesai Pada': tx.ts } },
      ]);
      tx.log(r['Request ID'], 'Request', r.Status, REQUEST_STATUS.SELESAI, 'Semua task selesai');
      tx.notify.to(r['PIC Brand'], 'Tiket selesai', r['Request ID'], msg.requestDone(r));
      return { ok: true, message: `Task ditutup. Request ${r['Request ID']} selesai.` };
    }
    return { ok: true, message: 'Task ditutup.' };
  });
}

export async function updatePriority(
  store: Store,
  user: CurrentUser,
  taskId: string,
  p: { deadline: string; urgent: boolean },
): Promise<ActionResult> {
  return withTask(store, user, taskId, async (tx, t) => {
    if (!can.prioritize(user, t)) return fail('Hanya Traffic atau Creative Head yang bisa mengubah prioritas.');
    if (t.Status === STATUS.FINAL || t.Status === STATUS.SELESAI) return fail('Task sudah final.');
    if (!isYmd(p.deadline)) return fail('Deadline tidak valid.');
    const rule = tx.db.master.kategori.find((k) => k.kategori === t.Kategori && k.divisi === t.Divisi);
    let target = addWorkingDays(p.deadline, -(rule?.bufferReview ?? 1), tx.db.master.holidays);
    if (target < tx.today) target = tx.today;
    const extra = {
      Deadline: p.deadline,
      'Target Draft': target,
      Urgent: p.urgent ? 'Ya' : 'Tidak',
      'Reminder Terkirim': '',
    };
    await writeTask(tx, taskId, extra);
    tx.log(taskId, 'Task', t.Status, t.Status, `Deadline ${t.Deadline} → ${p.deadline}${p.urgent ? ' (URGENT)' : ''}`);
    tx.notify.toMany([t.Assignee, t.Lead], 'Prioritas diubah', taskId, msg.priorityChanged({ ...t, ...extra }, user.name));
    return { ok: true, message: 'Deadline/prioritas diperbarui.' };
  });
}

/** Admin: paksa status (koreksi data). Tidak mengirim WA. */
export async function overrideStatus(
  store: Store,
  user: CurrentUser,
  taskId: string,
  to: Status,
  note: string,
): Promise<ActionResult> {
  return withTask(store, user, taskId, async (tx, t) => {
    if (!can.override(user)) return fail('Hanya admin yang bisa memaksa status.');
    if (!note.trim()) return fail('Tulis alasan perubahan.');
    await writeTask(tx, taskId, statusPatch(tx, t, to));
    tx.log(taskId, 'Task', t.Status, to, `Override admin: ${note.trim()}`);
    return { ok: true, message: `Status diubah ke ${to}.` };
  });
}

