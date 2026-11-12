/**
 * Aksi-aksi bisnis: setiap fungsi membaca data terbaru, memvalidasi hak akses
 * dan alur status, menulis perubahan, mencatat log status, lalu mengirim WA.
 */
import {
  CAMPAIGN_TYPES,
  CATEGORIES,
  CUSTOM_CATEGORY,
  DIVISI,
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
import { findPerson, leadFor, peranOf, type Master } from './master';
import { msg } from './messages';
import { holderName } from './mine';
import { Notifier } from './notify';
import { buildTaskDrafts, isUrgent, nextTicketId, routeRequest, taskIds } from './routing';
import type { Cell, Store } from './store';
import { ballHolder, can, canTransition, type CurrentUser } from './workflow';

export interface ActionResult {
  ok: boolean;
  message: string;
  id?: string;
}

const fail = (message: string): ActionResult => ({ ok: false, message });

export const KOMENTAR_JENIS = ['Catatan', 'QC lead', 'Revisi brand'] as const;
export type KomentarJenis = (typeof KOMENTAR_JENIS)[number];

/** Maks. 6 lampiran per komentar, hanya URL http(s) (hasil upload atau link Drive). */
function cleanAttachments(list: string[] = []): string[] {
  return list
    .map((x) => String(x || '').trim())
    .filter((x) => /^(https?:\/\/|\/api\/(upload|drive)\/)\S+$/i.test(x))
    .slice(0, 6);
}

/** Peran seseorang relatif terhadap task (untuk label komentar). */
export function roleOnTask(db: Db, name: string, t: TaskRow): string {
  if (name === t.Assignee) return 'Assignee';
  if (name === t.Lead) return 'Lead';
  if (name === t['PIC Brand']) return 'PIC brand';
  if (name === trafficOf(db, t)) return 'Traffic';
  const p = findPerson(db.master, name);
  return p ? peranOf(p) || p.peran : 'Admin';
}

const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(String(s || '').trim());

class Tx {
  logs: Record<string, Cell>[] = [];
  comments: Record<string, Cell>[] = [];
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
    this.logs.push({
      Timestamp: this.ts,
      ID: id,
      Level: level,
      Dari: from,
      Ke: to,
      Oleh: this.by,
      Catatan: note,
    });
  }

  /** Catat komentar/catatan pada thread task (tab Komentar). */
  comment(
    t: Pick<TaskRow, 'Task ID' | 'Versi Draft'>,
    c: {
      peran: string;
      jenis: KomentarJenis | 'Draft';
      isi: string;
      lampiran?: string[];
      versi?: string;
    },
  ) {
    this.comments.push({
      Timestamp: this.ts,
      'Komentar ID': `K${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${this.comments.length}`,
      'Task ID': t['Task ID'],
      Oleh: this.by,
      Peran: c.peran,
      Jenis: c.jenis,
      Versi: c.versi ?? String(Number(t['Versi Draft']) || 0),
      Isi: c.isi,
      Lampiran: (c.lampiran || []).join('\n'),
    });
  }

  /**
   * Kirim juga ke assignee task saat ini (aturan: setiap event task sampai ke assignee terbaru),
   * kecuali assignee itu sendiri yang melakukan aksinya.
   */
  toAssignee(t: Pick<TaskRow, 'Assignee'>, jenis: string, refId: string, message: string) {
    if (t.Assignee && t.Assignee !== this.by) this.notify.to(t.Assignee, jenis, refId, message);
  }

  async commit() {
    if (this.logs.length) await this.store.append(SHEETS.STATUS_LOG, this.logs);
    if (this.comments.length) await this.store.append(SHEETS.KOMENTAR, this.comments);
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
  req('dueDate', 'Due Date');
  // Brief kreatif (USP, key message, creative note, target audience, budget, deliverables) opsional:
  // bisa dilengkapi kemudian dari halaman detail task.

  if (input.brand && !master.brands.some((b) => b.active && b.name === input.brand)) errors.brand = 'Brand tidak dikenal';
  if (input.dueDate) {
    if (!isYmd(input.dueDate)) errors.dueDate = 'Format tanggal tidak valid';
    else if (input.dueDate < today) errors.dueDate = 'Due date tidak boleh di masa lalu';
  }
  if (input.budget && !/^\d+$/.test(String(input.budget).replace(/[.,\s]|^rp/gi, ''))) errors.budget = 'Budget harus berupa angka (Rp)';
  if (input.supportingLink && !isUrl(input.supportingLink)) errors.supportingLink = 'Link harus diawali http:// atau https://';

  for (const k of input.kategori || []) {
    const def = CATEGORIES.find((c) => c.name === k);
    if (!def || !master.kategori.some((r) => r.kategori === k)) {
      errors.kategori = `Kategori "${k}" tidak dikenal`;
      continue;
    }
    if (!(input.subJenis[k] || []).length && def.subTypes.length === 1) input.subJenis[k] = [def.subTypes[0]];
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
  else if (input.brand && pic.brands.length && !pic.brands.some((b) => b.toLowerCase() === input.brand.toLowerCase()))
    errors.picName = `${pic.name} tidak memegang brand ${input.brand}. Atur brand-nya di Kelola user.`;
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
    Budget: Number(String(input.budget).replace(/[.,\s]|^rp/gi, '')) || 0,
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
  p: {
    requestId: string;
    decision: 'Lengkap' | 'Kurang';
    note: string;
    deadline?: string;
  },
): Promise<ActionResult> {
  const db = await loadDb(store, { fresh: true });
  const r = findRequest(db, p.requestId);
  if (!r) return fail('Request tidak ditemukan.');
  if (!can.cekBrief(user, r)) return fail('Hanya Traffic grup ini yang bisa mengecek brief.');
  if (r.Status !== REQUEST_STATUS.BARU && r.Status !== REQUEST_STATUS.BRIEF_KURANG) return fail(`Request sudah berstatus ${r.Status}.`);
  if (tasksOf(db, r['Request ID']).length) return fail('Task untuk request ini sudah dibuat.');

  const tx = new Tx(store, db, user.name);
  const { master } = db;

  if (p.decision === 'Kurang') {
    if (!p.note.trim()) return fail('Tulis apa yang perlu dilengkapi PIC.');
    await store.update(SHEETS.REQUEST, 'Request ID', [
      {
        key: r['Request ID'],
        patch: {
          'Cek Brief': 'Kurang',
          'Catatan Traffic': p.note.trim(),
          Status: REQUEST_STATUS.BRIEF_KURANG,
          'Status Sejak': tx.ts,
        },
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

  const kategoriList = r.Kategori.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
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

  const ids = taskIds(
    r['Request ID'],
    drafts.map((d) => d.code),
  );
  const newTasks: TaskRow[] = drafts.map((d, i) => {
    const t = {
      'Task ID': ids[i],
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
    tx.log(
      t['Task ID'],
      'Task',
      '',
      STATUS.SIAP_ASSIGN,
      t.Kategori === CUSTOM_CATEGORY
        ? 'Custom: menunggu Traffic mengatur divisi, lead & deadline'
        : `Routing ke ${t.Divisi} (lead ${t.Lead})`,
    );
    if (t.Assignee) tx.log(t['Task ID'], 'Task', STATUS.SIAP_ASSIGN, STATUS.DIKERJAKAN, `Auto-assign ke ${t.Assignee}`);
    // Lead yang sekaligus assignee cukup menerima satu pesan "Tugas baru untukmu".
    if (t.Lead && t.Lead !== t.Assignee) tx.notify.to(t.Lead, 'Tugas baru (lead)', t['Task ID'], msg.newTaskLead(t, r));
    if (t.Assignee) tx.notify.to(t.Assignee, 'Tugas baru', t['Task ID'], msg.taskAssigned(t, r));
  }
  await tx.commit();
  return {
    ok: true,
    message: `Brief lengkap. ${newTasks.length} task dibuat dan dikirim ke lead divisi.`,
  };
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
    Budget: Number(String(input.budget).replace(/[.,\s]|^rp/gi, '')) || 0,
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
  if (wasKurang)
    Object.assign(patch, {
      Status: REQUEST_STATUS.BARU,
      'Cek Brief': '',
      'Status Sejak': tx.ts,
    });
  await store.update(SHEETS.REQUEST, 'Request ID', [{ key: requestId, patch }]);
  if (wasKurang) {
    tx.log(requestId, 'Request', STATUS.BRIEF_KURANG, STATUS.BARU, 'Brief dilengkapi PIC');
    tx.notify.to(r.Traffic, 'Brief dilengkapi', requestId, msg.briefResubmitted({ ...r, ...(patch as Partial<RequestRow>) }));
  }
  await tx.commit();
  return {
    ok: true,
    message: wasKurang ? 'Brief dikirim ulang ke Traffic.' : 'Brief diperbarui.',
    id: requestId,
  };
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
      await writeTask(tx, taskId, {
        Assignee: person.name,
        'Bola di': ballHolder(t.Status, updated, r.Traffic),
      });
      tx.log(taskId, 'Task', t.Status, t.Status, `Assignee diganti: ${t.Assignee || '-'} → ${person.name}`);
    }
    tx.notify.to(person.name, 'Tugas baru', taskId, msg.taskAssigned({ ...updated, Status: STATUS.DIKERJAKAN }, r));
    // Assignee lama diberi tahu bahwa task sudah dipindah (event berikutnya ikut assignee baru).
    tx.toAssignee(t, 'Assignee diganti', taskId, msg.reassignedAway(t, person.name, user.name));
    return { ok: true, message: `Task di-assign ke ${person.name}.` };
  });
}

export async function submitDraft(
  store: Store,
  user: CurrentUser,
  taskId: string,
  link: string,
  previews: string[] = [],
  note = '',
): Promise<ActionResult> {
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
    tx.comment(t, {
      peran: roleOnTask(tx.db, user.name, t),
      jenis: 'Draft',
      versi: String(versi),
      isi: [link.trim(), note.trim()].filter(Boolean).join('\n'),
      lampiran: cleanAttachments(previews),
    });
    tx.notify.to(t.Lead, 'Draft menunggu QC', taskId, msg.draftForQc({ ...t, ...extra }));
    tx.toAssignee(t, 'Draft menunggu QC', taskId, msg.draftForQc({ ...t, ...extra }));
    return {
      ok: true,
      message: `Draft v${versi} terkirim ke ${t.Lead} untuk QC.`,
    };
  });
}

export async function qcDecision(
  store: Store,
  user: CurrentUser,
  taskId: string,
  pass: boolean,
  note: string,
  lampiran: string[] = [],
): Promise<ActionResult> {
  return withTask(store, user, taskId, async (tx, t, r) => {
    if (!can.qc(user, t)) return fail('Hanya lead divisi yang bisa QC.');
    const bad = requireStatus(t, STATUS.QC_LEAD);
    if (bad) return bad;
    if (pass) {
      const extra = note.trim()
        ? {
            'Catatan QC': appendNote(t['Catatan QC'], `v${t['Versi Draft']} lolos (${tx.ts}): ${note.trim()}`),
          }
        : {};
      await writeTask(tx, taskId, statusPatch(tx, t, STATUS.REVIEW_BRAND, extra));
      tx.log(taskId, 'Task', t.Status, STATUS.REVIEW_BRAND, note.trim() || 'Lolos QC');
      tx.comment(t, {
        peran: 'Lead',
        jenis: 'QC lead',
        isi: `✅ Lolos QC${note.trim() ? `: ${note.trim()}` : ''}`,
        lampiran: cleanAttachments(lampiran),
      });
      tx.notify.to(t['PIC Brand'], 'Draft siap review', taskId, msg.reviewToPic(t, r));
      tx.toAssignee(t, 'Draft lolos QC', taskId, msg.qcPassedToAssignee(t, user.name));
      return {
        ok: true,
        message: `Draft lolos QC dan dikirim ke PIC ${t['PIC Brand']}.`,
      };
    }
    if (!note.trim()) return fail('Tulis catatan QC agar assignee tahu apa yang diperbaiki.');
    const extra = {
      'Catatan QC': appendNote(t['Catatan QC'], `v${t['Versi Draft']} belum lolos (${tx.ts}): ${note.trim()}`),
    };
    await writeTask(tx, taskId, statusPatch(tx, t, STATUS.REVISI_INTERNAL, extra));
    tx.log(taskId, 'Task', t.Status, STATUS.REVISI_INTERNAL, note.trim());
    tx.comment(t, {
      peran: 'Lead',
      jenis: 'QC lead',
      isi: `↩️ Belum lolos QC: ${note.trim()}`,
      lampiran: cleanAttachments(lampiran),
    });
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
  lampiran: string[] = [],
): Promise<ActionResult> {
  return withTask(store, user, taskId, async (tx, t, r) => {
    if (!can.review(user, t)) return fail(`Hanya PIC brand (${t['PIC Brand']}) atau Traffic yang bisa review.`);
    const bad = requireStatus(t, STATUS.REVIEW_BRAND);
    if (bad) return bad;
    if (action === 'ACC') {
      await writeTask(tx, taskId, statusPatch(tx, t, STATUS.ACC));
      tx.log(taskId, 'Task', t.Status, STATUS.ACC, `ACC via ${via}${note.trim() ? `: ${note.trim()}` : ''}`);
      if (note.trim() || lampiran.length)
        tx.comment(t, {
          peran: roleOnTask(tx.db, user.name, t),
          jenis: 'Catatan',
          isi: `✅ ACC via ${via}${note.trim() ? `: ${note.trim()}` : ''}`,
          lampiran: cleanAttachments(lampiran),
        });
      tx.notify.toMany([t.Assignee, t.Lead], 'Draft ACC', taskId, msg.accToAssignee(t));
      return {
        ok: true,
        message: `${taskId} di-ACC. Assignee diminta upload file final.`,
      };
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
    tx.comment(t, {
      peran: roleOnTask(tx.db, user.name, t),
      jenis: 'Revisi brand',
      isi: `R${ronde}${via === 'WA' ? ' (via WA)' : ''}: ${note.trim()}`,
      lampiran: cleanAttachments(lampiran),
    });
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
    tx.toAssignee(t, 'File final', taskId, msg.finalToTraffic({ ...t, ...extra }));
    return {
      ok: true,
      message: 'File final tersimpan. Traffic akan menutup tiket.',
    };
  });
}

export async function closeTask(store: Store, user: CurrentUser, taskId: string): Promise<ActionResult> {
  return withTask(store, user, taskId, async (tx, t, r) => {
    if (!can.close(user, t)) return fail('Hanya Traffic atau Creative Head yang bisa menutup tiket.');
    const bad = requireStatus(t, STATUS.FINAL);
    if (bad) return bad;
    await writeTask(tx, taskId, {
      Status: STATUS.SELESAI,
      'Bola di': '-',
      'Status Sejak': tx.ts,
    });
    tx.log(taskId, 'Task', t.Status, STATUS.SELESAI, 'Tiket ditutup');
    tx.toAssignee(t, 'Tiket ditutup', taskId, msg.taskClosed(t, user.name));
    const siblings = tasksOf(tx.db, r['Request ID']).filter((x) => x['Task ID'] !== taskId);
    if (siblings.every((x) => x.Status === STATUS.SELESAI)) {
      await tx.store.update(SHEETS.REQUEST, 'Request ID', [
        {
          key: r['Request ID'],
          patch: {
            Status: REQUEST_STATUS.SELESAI,
            'Status Sejak': tx.ts,
            'Selesai Pada': tx.ts,
          },
        },
      ]);
      tx.log(r['Request ID'], 'Request', r.Status, REQUEST_STATUS.SELESAI, 'Semua task selesai');
      tx.notify.to(r['PIC Brand'], 'Tiket selesai', r['Request ID'], msg.requestDone(r));
      return {
        ok: true,
        message: `Task ditutup. Request ${r['Request ID']} selesai.`,
      };
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
export async function overrideStatus(store: Store, user: CurrentUser, taskId: string, to: Status, note: string): Promise<ActionResult> {
  return withTask(store, user, taskId, async (tx, t) => {
    if (!can.override(user)) return fail('Hanya admin yang bisa memaksa status.');
    if (!note.trim()) return fail('Tulis alasan perubahan.');
    await writeTask(tx, taskId, statusPatch(tx, t, to));
    tx.log(taskId, 'Task', t.Status, to, `Override admin: ${note.trim()}`);
    return { ok: true, message: `Status diubah ke ${to}.` };
  });
}

// ---------------------------------------------------------------------------
// 4. Deskripsi & komentar task
// ---------------------------------------------------------------------------

export function canComment(db: Db, u: CurrentUser, t: TaskRow): boolean {
  const traffic = trafficOf(db, t);
  return (
    u.roles.some((r) => r === 'admin' || r === 'hocp' || r === 'head') ||
    [t.Assignee, t.Lead, t['PIC Brand'], traffic].includes(u.name) ||
    (u.roles.includes('traffic') && (!u.grup || u.grup === 'Semua' || u.grup === t.Grup))
  );
}

/** Deskripsi / catatan pengerjaan: diubah assignee, lead, atau admin. */
export async function updateDescription(store: Store, user: CurrentUser, taskId: string, text: string): Promise<ActionResult> {
  return withTask(store, user, taskId, async (tx, t) => {
    if (!can.work(user, t) && !can.qc(user, t)) return fail('Hanya assignee atau lead yang bisa mengubah deskripsi.');
    const v = text.trim().slice(0, 5000);
    if (v === String(t.Deskripsi || '').trim()) return { ok: true, message: 'Tidak ada perubahan.' };
    await writeTask(tx, taskId, { Deskripsi: v });
    tx.log(taskId, 'Task', t.Status, t.Status, 'Deskripsi diperbarui');
    return { ok: true, message: 'Deskripsi disimpan.' };
  });
}

/**
 * Tambah komentar di thread task. Label "Revisi brand" saat draft di tahap Review brand sama dengan
 * meminta revisi (ronde +1, status Revisi brand). Pemegang bola diberi tahu lewat WA.
 */
export async function addComment(
  store: Store,
  user: CurrentUser,
  taskId: string,
  c: { jenis: string; isi: string; lampiran: string[]; versi?: string },
): Promise<ActionResult> {
  const jenis = (KOMENTAR_JENIS as readonly string[]).includes(c.jenis) ? (c.jenis as KomentarJenis) : 'Catatan';
  const isi = c.isi.trim().slice(0, 4000);
  const lampiran = cleanAttachments(c.lampiran);
  if (!isi && !lampiran.length) return fail('Tulis komentar atau lampirkan gambar.');

  if (jenis === 'Revisi brand') {
    const db = await loadDb(store, { fresh: true });
    const t = findTask(db, taskId);
    if (!t) return fail('Task tidak ditemukan.');
    if (!can.review(user, t)) return fail(`Label Revisi brand hanya untuk PIC brand (${t['PIC Brand']}) atau Traffic.`);
    if (t.Status !== STATUS.REVIEW_BRAND)
      return fail('Label Revisi brand hanya bisa dipakai saat draft di tahap Review brand. Pakai label Catatan untuk komentar biasa.');
    if (!isi) return fail('Tulis catatan revisinya.');
    return brandReview(store, user, taskId, 'REV', isi, 'web', lampiran);
  }

  return withTask(store, user, taskId, async (tx, t) => {
    if (!canComment(tx.db, user, t)) return fail('Kamu tidak terlibat di task ini.');
    if (jenis === 'QC lead' && !can.qc(user, t)) return fail('Label QC lead hanya untuk lead divisi.');
    // Komentar boleh ditujukan ke versi draft tertentu (mis. "untuk v1"); default versi terbaru.
    const latest = Number(t['Versi Draft']) || 0;
    const wanted = Number(c.versi);
    const versi = Number.isInteger(wanted) && wanted >= 1 && wanted <= latest ? String(wanted) : String(latest);
    tx.comment(t, {
      peran: roleOnTask(tx.db, user.name, t),
      jenis,
      isi,
      lampiran,
      versi,
    });
    const holder = holderName(t['Bola di']);
    // Pemegang bola + assignee (bila berbeda), tanpa si penulis komentar.
    const base = holder && holder !== user.name ? [holder] : [t.Lead].filter((n) => n && n !== user.name);
    const targets = [...new Set([...base, t.Assignee].filter((n) => n && n !== user.name))];
    tx.notify.toMany(targets, 'Komentar baru', taskId, msg.newComment(t, user.name, jenis, isi, lampiran.length));
    return {
      ok: true,
      message: targets.length ? `Komentar terkirim. ${targets.join(', ')} diberi tahu lewat WA.` : 'Komentar terkirim.',
    };
  });
}

// ---------------------------------------------------------------------------
// 5. Task custom ("Lainnya (custom)"): Traffic mengatur divisi, lead, deadline, atau mengubah kategori
// ---------------------------------------------------------------------------

export function needsCustomSetup(t: Pick<TaskRow, 'Kategori' | 'Lead' | 'Status'>): boolean {
  return t.Kategori === CUSTOM_CATEGORY && !t.Lead && t.Status === STATUS.SIAP_ASSIGN;
}

export async function setupCustomTask(
  store: Store,
  user: CurrentUser,
  taskId: string,
  p: {
    kategori: string;
    divisi: string;
    lead: string;
    deadline: string;
    jenisCustom: string;
  },
): Promise<ActionResult> {
  return withTask(store, user, taskId, async (tx, t, r) => {
    if (!can.prioritize(user, t)) return fail('Hanya Traffic atau Creative Head yang bisa mengatur task custom.');
    if (t.Kategori !== CUSTOM_CATEGORY || t.Status !== STATUS.SIAP_ASSIGN) return fail('Task ini bukan task custom yang menunggu diatur.');
    const { master } = tx.db;
    const convert = p.kategori && p.kategori !== CUSTOM_CATEGORY;
    let kategori = CUSTOM_CATEGORY;
    let divisi = p.divisi.trim();
    let rule = undefined as (typeof master.kategori)[number] | undefined;
    if (convert) {
      const rules = master.kategori.filter((k) => k.kategori === p.kategori);
      if (!rules.length) return fail('Kategori tujuan tidak dikenal.');
      rule = rules.find((k) => k.divisi === divisi) || rules[0];
      kategori = rule.kategori;
      divisi = rule.divisi;
    } else {
      if (!DIVISI.some((d) => d.value === divisi)) return fail('Pilih divisi.');
      if (!p.jenisCustom.trim()) return fail('Isi jenis pekerjaan custom (mis. "Banner marketplace") agar bisa direkap.');
    }
    const preferred = rule ? (t.Grup.toLowerCase().startsWith('women') ? rule.leadWomenswear : rule.leadMenswear) : '';
    const leadName = p.lead.trim() || leadFor(master, divisi, t.Grup, preferred);
    const lead = findPerson(master, leadName);
    if (!lead || !lead.active) return fail('Pilih lead yang aktif.');

    const deadline = (p.deadline || t.Deadline).slice(0, 10);
    if (!isYmd(deadline)) return fail('Deadline tidak valid.');
    if (deadline < tx.today) return fail('Deadline tidak boleh di masa lalu.');
    let target = addWorkingDays(deadline, -(rule?.bufferReview ?? 1), master.holidays);
    if (target < tx.today) target = tx.today;

    const patch = {
      Kategori: kategori,
      Divisi: divisi,
      Lead: lead.name,
      Deadline: deadline,
      'Target Draft': target,
      'Jenis Custom': convert ? '' : p.jenisCustom.trim().slice(0, 60),
      'Bola di': `Lead (${lead.name})`,
    };
    await writeTask(tx, taskId, patch);
    const note = convert
      ? `Custom diubah ke kategori ${kategori} (${divisi}), lead ${lead.name}`
      : `Custom "${patch['Jenis Custom']}" diatur ke ${divisi}, lead ${lead.name}`;
    tx.log(taskId, 'Task', t.Status, t.Status, `${note}, deadline ${deadline}`);
    const updated = { ...t, ...patch };
    tx.notify.to(lead.name, 'Tugas baru (lead)', taskId, msg.newTaskLead(updated, r));
    return {
      ok: true,
      message: `${note}. ${lead.name} diberi tahu untuk assign anggota.`,
    };
  });
}

// ---------------------------------------------------------------------------
// 6. Edit brief & link draft dari halaman detail task
// ---------------------------------------------------------------------------

/** Ambil nilai field kategori dari baris "Kategori — Label: nilai; Label2: nilai2" di kolom Detail Kategori. */
export function parseDetailLine(detailKategori: string, kategori: string): Record<string, string> {
  const def = CATEGORIES.find((c) => c.name === kategori);
  const line = String(detailKategori || '')
    .split('\n')
    .find((l) => l.startsWith(`${kategori} — `));
  const out: Record<string, string> = {};
  if (!def || !line) return out;
  const body = line.slice(kategori.length + 3);
  const labels = def.fields.map((f) => f.label);
  // Pecah di "; Label:" yang dikenal, agar nilai yang memuat ";" tetap utuh.
  const parts = body.split(new RegExp(`;\\s(?=(?:${labels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}):\\s)`));
  for (const part of parts) {
    const f = def.fields.find((x) => part.startsWith(`${x.label}: `));
    if (f) out[f.key] = part.slice(f.label.length + 2).trim();
  }
  return out;
}

export interface BriefEdit {
  campaignName: string;
  campaignType: string;
  objective: string;
  usp: string;
  keyMessage: string;
  creativeNote: string;
  targetAudience: string;
  budget: string;
  deliverables: string;
  supportingLink: string;
  attachments: string;
  subJenis: string[];
  details: Record<string, string>;
}

export function canEditBriefFromTask(db: Db, u: CurrentUser, t: TaskRow): boolean {
  const r = findRequest(db, t['Request ID']);
  return !!r && t.Status !== STATUS.SELESAI && (can.editBrief(u, r) || u.name === t.Lead);
}

/** Perbarui brief request langsung dari detail task. Perubahan tercatat di riwayat & tim task diberi tahu. */
export async function editBriefFromTask(store: Store, user: CurrentUser, taskId: string, e: BriefEdit): Promise<ActionResult> {
  return withTask(store, user, taskId, async (tx, t, r) => {
    if (!canEditBriefFromTask(tx.db, user, t)) return fail('Kamu tidak punya akses mengubah brief task ini.');
    const def = CATEGORIES.find((c) => c.name === t.Kategori);
    if (!e.campaignName.trim()) return fail('Campaign Name wajib diisi.');
    if (!CAMPAIGN_TYPES.includes(e.campaignType)) return fail('Pilih Campaign Type.');
    if (!e.objective.trim()) return fail('Objective wajib diisi.');
    const budgetDigits = String(e.budget || '').replace(/[.,\s]|^rp/gi, '');
    if (budgetDigits && !/^\d+$/.test(budgetDigits)) return fail('Budget harus berupa angka (Rp).');
    if (e.supportingLink.trim() && !isUrl(e.supportingLink)) return fail('Supporting Link harus diawali http:// atau https://');
    const sub = def ? e.subJenis.filter((x) => def.subTypes.includes(x)) : [];
    if (def && !sub.length) return fail(`Pilih minimal satu sub-jenis ${t.Kategori}.`);
    for (const f of def?.fields || []) {
      const v = String(e.details[f.key] ?? '').trim();
      if (f.required && !v) return fail(`${f.label} wajib diisi.`);
      if (v && f.type === 'number' && !(Number(v) > 0)) return fail(`${f.label} harus angka > 0.`);
    }

    // Detail Kategori: ganti hanya baris kategori task ini.
    const lines = String(r['Detail Kategori'] || '')
      .split('\n')
      .filter(Boolean);
    const newLine = formatDetails({ kategori: [t.Kategori], details: { [t.Kategori]: e.details } });
    const idx = lines.findIndex((l) => l.startsWith(`${t.Kategori} — `));
    if (def) {
      if (idx >= 0) lines[idx] = newLine;
      else lines.push(newLine);
    }
    // Sub-jenis request: ganti sub-jenis milik kategori ini saja.
    const otherSubs = String(r['Sub-jenis'] || '')
      .split(',')
      .map((x) => x.trim())
      .filter((x) => x && !(def?.subTypes || []).includes(x));

    const next: Record<string, Cell> = {
      'Campaign Name': e.campaignName.trim(),
      'Campaign Type': e.campaignType,
      Objective: e.objective.trim(),
      'Product Knowledge/USP': e.usp.trim(),
      'Key Message': e.keyMessage.trim(),
      'Creative Note': e.creativeNote.trim(),
      'Target Audience': e.targetAudience.trim(),
      Budget: Number(budgetDigits) || 0,
      Deliverables: e.deliverables.trim(),
      'Supporting Link': e.supportingLink.trim(),
      Attachments: e.attachments.trim(),
      'Detail Kategori': lines.join('\n'),
      'Sub-jenis': [...otherSubs, ...sub].join(', '),
    };
    const LABEL: Record<string, string> = {
      'Product Knowledge/USP': 'USP',
      'Detail Kategori': 'Detail',
    };
    const changed = Object.keys(next).filter((k) => String(next[k] ?? '') !== String((r as unknown as Record<string, Cell>)[k] ?? ''));
    if (!changed.length) return { ok: true, message: 'Tidak ada perubahan.' };

    await tx.store.update(SHEETS.REQUEST, 'Request ID', [{ key: r['Request ID'], patch: next }]);
    const siblings = tasksOf(tx.db, r['Request ID']).filter((x) => x.Kategori === t.Kategori);
    if (def && siblings.length)
      await tx.store.update(
        SHEETS.TASK,
        'Task ID',
        siblings.map((x) => ({ key: x['Task ID'], patch: { 'Sub-jenis': sub.join(', ') } })),
      );
    const what = changed.map((k) => LABEL[k] || k).join(', ');
    tx.log(taskId, 'Task', t.Status, t.Status, `Brief diubah: ${what}`);
    tx.log(r['Request ID'], 'Request', r.Status, r.Status, `Brief diubah dari ${taskId}: ${what}`);
    const team = tasksOf(tx.db, r['Request ID']).flatMap((x) => [x.Assignee, x.Lead]);
    tx.notify.toMany(
      [...new Set(team)].filter((n) => n && n !== user.name),
      'Brief diperbarui',
      taskId,
      msg.briefUpdated(t, user.name, what),
    );
    return { ok: true, message: `Brief diperbarui (${what}).` };
  });
}

/** Perbaiki link draft versi terbaru tanpa membuat versi baru (mis. salah tempel link). */
export async function editDraftLink(store: Store, user: CurrentUser, taskId: string, link: string): Promise<ActionResult> {
  return withTask(store, user, taskId, async (tx, t) => {
    if (!can.work(user, t)) return fail('Hanya assignee atau lead yang bisa mengubah link draft.');
    const v = Number(t['Versi Draft']) || 0;
    if (!v) return fail('Belum ada draft.');
    if (t.Status === STATUS.SELESAI || t.Status === STATUS.FINAL) return fail('Task sudah final.');
    if (!isUrl(link)) return fail('Link draft harus diawali http:// atau https://');
    if (link.trim() === t['Link Draft']) return { ok: true, message: 'Tidak ada perubahan.' };
    const hist = String(t['Riwayat Draft'] || '').split('\n');
    const i = hist.map((l) => l.startsWith(`v${v} (`)).lastIndexOf(true);
    if (i >= 0) hist[i] = hist[i].replace(/:\s*\S+$/, `: ${link.trim()}`);
    await writeTask(tx, taskId, { 'Link Draft': link.trim(), 'Riwayat Draft': hist.join('\n') });
    tx.log(taskId, 'Task', t.Status, t.Status, `Link draft v${v} diubah`);
    return { ok: true, message: `Link draft v${v} diperbarui.` };
  });
}
