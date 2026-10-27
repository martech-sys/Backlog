import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { STATUS } from '../../lib/config';
import { setClock } from '../../lib/clock';
import { loadDb } from '../../lib/db';
import { runDigest, runReminders, runWeekly } from '../../lib/scheduler';
import * as svc from '../../lib/service';
import { extractIncoming, handleIncoming } from '../../lib/webhook';
import { canTransition, parseWaReply } from '../../lib/workflow';
import { at, requestInput, testStore, userOf } from './helpers';

afterEach(() => setClock(null));

test('parse balasan WA', () => {
  assert.deepEqual(parseWaReply('ACC CR-2610-001-1'), { action: 'ACC', id: 'CR-2610-001-1', note: '' });
  assert.deepEqual(parseWaReply('rev cr-2610-001-2 logo diperbesar'), { action: 'REV', id: 'CR-2610-001-2', note: 'logo diperbesar' });
  assert.deepEqual(parseWaReply('REVISI CR-2610-001: warna'), { action: 'REV', id: 'CR-2610-001', note: 'warna' });
  assert.equal(parseWaReply('halo kak'), null);
});

test('extractIncoming membaca payload Fonnte & Wablas', () => {
  assert.deepEqual(extractIncoming({ sender: '081234', message: 'ACC X' }), { sender: '6281234', message: 'ACC X' });
  assert.deepEqual(extractIncoming({ phone: '6281234@s.whatsapp.net', message: 'hi' }), { sender: '6281234', message: 'hi' });
});

test('aturan transisi status', () => {
  assert.equal(canTransition(STATUS.QC_LEAD, STATUS.REVIEW_BRAND), true);
  assert.equal(canTransition(STATUS.DIKERJAKAN, STATUS.ACC), false);
  assert.equal(canTransition(STATUS.SELESAI, STATUS.DIKERJAKAN), false);
});

test('alur lengkap: form → cek brief → assign → draft → QC → REV via WA → ACC → final → tutup', async () => {
  const store = testStore();
  const brama = await userOf(store, 'Brama');
  const evi = await userOf(store, 'Evi');
  const aulia = await userOf(store, 'Aulia Pramudya');
  const ahmad = await userOf(store, 'Ahmad Husen');
  const desB = await userOf(store, 'Desainer B');

  at('2026-10-27T02:00:00Z'); // Selasa 09:00 WIB
  const sub = await svc.submitRequest(store, brama, requestInput({ kategori: ['Desain grafis', 'Fotoshoot'], subJenis: { 'Desain grafis': ['Poster'], Fotoshoot: ['Katalog'] }, details: { 'Desain grafis': { ukuran: '4:5', jumlahDesain: '2' }, Fotoshoot: { jumlahSku: '12', lokasi: 'Studio', model: 'Ya' } }, dueDate: '2026-11-04' }));
  assert.equal(sub.ok, true, sub.message);
  assert.equal(sub.id, 'CR-2610-001');
  let db = await loadDb(store, { withWaLog: true });
  const r = db.requests[0];
  assert.equal(r.Grup, 'Menswear');
  assert.equal(r.Traffic, 'Evi');
  assert.equal(r.Urgent, 'Ya', 'Fotoshoot butuh 7 hari kerja, due 4 Nov hanya 6 hari kerja');
  assert.ok(db.waLog.some((w) => w.Nama === 'Ammar Habibullah' && w.Jenis === 'Request URGENT'));
  assert.ok(db.waLog.some((w) => w.Nama === 'Brama' && w.Jenis === 'Request diterima'));
  assert.ok(db.waLog.some((w) => w.Nama === 'Evi' && w.Jenis === 'Request baru'));

  // Validasi form
  const bad = await svc.submitRequest(store, brama, requestInput({ brand: '', kategori: ['Videografis'], subJenis: {}, details: {} }));
  assert.equal(bad.ok, false);
  assert.ok(bad.errors?.brand && bad.errors['sub:Videografis'] && bad.errors['detail:Videografis:durasi']);

  // PIC tidak boleh cek brief
  assert.equal((await svc.cekBrief(store, brama, { requestId: 'CR-2610-001', decision: 'Lengkap', note: '' })).ok, false);

  // Brief kurang → PIC lengkapi → Traffic OK
  at('2026-10-27T03:00:00Z');
  assert.equal((await svc.cekBrief(store, evi, { requestId: 'CR-2610-001', decision: 'Kurang', note: 'Lampirkan foto produk' })).ok, true);
  at('2026-10-27T05:00:00Z');
  const upd = await svc.updateBrief(store, brama, 'CR-2610-001', requestInput({ kategori: ['Desain grafis', 'Fotoshoot'], subJenis: { 'Desain grafis': ['Poster'], Fotoshoot: ['Katalog'] }, details: { 'Desain grafis': { ukuran: '4:5', jumlahDesain: '2' }, Fotoshoot: { jumlahSku: '12', lokasi: 'Studio', model: 'Ya' } }, attachments: 'https://drive.google.com/x', dueDate: '2026-11-13' }));
  assert.equal(upd.ok, true, upd.message);
  at('2026-10-27T06:00:00Z');
  const ok = await svc.cekBrief(store, evi, { requestId: 'CR-2610-001', decision: 'Lengkap', note: '' });
  assert.equal(ok.ok, true, ok.message);

  db = await loadDb(store);
  assert.equal(db.requests[0].Status, 'Diproses');
  assert.equal(db.requests[0].Urgent, 'Tidak', 'due date baru 13 Nov cukup waktu');
  assert.equal(db.tasks.length, 3);
  const byDiv = (d: string) => db.tasks.find((x) => x.Divisi === d)!;
  const [desain, foto, styling] = [byDiv('Desain'), byDiv('Foto'), byDiv('Styling')];
  assert.deepEqual([desain.Divisi, desain.Assignee, desain.Status], ['Desain', 'Desainer A', STATUS.DIKERJAKAN]);
  assert.deepEqual([foto.Divisi, foto.Lead, foto.Status, foto['Bola di']], ['Foto', 'Ahmad Husen', STATUS.SIAP_ASSIGN, 'Lead (Ahmad Husen)']);
  assert.equal(styling.Assignee, 'Salsa Rosyidah');
  assert.equal(desain.Deadline, '2026-11-13');
  assert.equal(desain['Target Draft'], '2026-11-12');

  // Lead ganti assignee desain ke Desainer B; Ahmad assign foto
  assert.equal((await svc.assignTask(store, aulia, desain['Task ID'], 'Desainer B')).ok, true);
  assert.equal((await svc.assignTask(store, desB, foto['Task ID'], 'Desainer B')).ok, false, 'anggota biasa tidak boleh assign');
  assert.equal((await svc.assignTask(store, ahmad, foto['Task ID'], 'Ahmad Husen')).ok, true);

  // Draft → QC gagal → draft v2 → QC lolos
  const id = desain['Task ID'];
  assert.equal((await svc.submitDraft(store, desB, id, 'bukan-link')).ok, false);
  assert.equal((await svc.submitDraft(store, desB, id, 'https://drive.google.com/v1')).ok, true);
  assert.equal((await svc.qcDecision(store, aulia, id, false, '')).ok, false, 'catatan wajib');
  assert.equal((await svc.qcDecision(store, aulia, id, false, 'Font terlalu kecil')).ok, true);
  assert.equal((await svc.submitDraft(store, desB, id, 'https://drive.google.com/v2')).ok, true);
  assert.equal((await svc.qcDecision(store, aulia, id, true, '')).ok, true);
  db = await loadDb(store);
  let t = db.tasks.find((x) => x['Task ID'] === id)!;
  assert.deepEqual([t.Status, t['Versi Draft'], t['Bola di']], [STATUS.REVIEW_BRAND, '2', 'PIC Brand (Brama)']);

  // REV via WhatsApp dari nomor Brama, lalu ACC via request ID
  const bramaPhone = db.master.people.find((p) => p.name === 'Brama')!.phone;
  const rev = await handleIncoming(store, bramaPhone, `REV ${id} logo diperbesar`);
  assert.equal(rev.handled, true, rev.reply);
  db = await loadDb(store);
  t = db.tasks.find((x) => x['Task ID'] === id)!;
  assert.deepEqual([t.Status, t['Ronde Revisi']], [STATUS.REVISI_BRAND, '1']);
  assert.match(t['Catatan Revisi'], /logo diperbesar/);

  const stranger = await handleIncoming(store, '6289999999', `ACC ${id}`);
  assert.equal(stranger.handled, false);

  await svc.submitDraft(store, desB, id, 'https://drive.google.com/v3');
  await svc.qcDecision(store, aulia, id, true, '');
  const acc = await handleIncoming(store, bramaPhone, 'ACC CR-2610-001');
  assert.equal(acc.handled, true, acc.reply);

  // Final → tutup
  at('2026-11-10T03:00:00Z');
  assert.equal((await svc.closeTask(store, evi, id)).ok, false, 'belum final');
  assert.equal((await svc.submitFinal(store, desB, id, 'https://drive.google.com/final')).ok, true);
  assert.equal((await svc.closeTask(store, evi, id)).ok, true);
  db = await loadDb(store, { withWaLog: true });
  t = db.tasks.find((x) => x['Task ID'] === id)!;
  assert.deepEqual([t.Status, t['Selesai Pada'].slice(0, 10)], [STATUS.SELESAI, '2026-11-10']);
  assert.equal(db.requests[0].Status, 'Diproses', 'task lain belum selesai');
  assert.ok(db.statusLog.filter((l) => l.ID === id).length >= 10);
  assert.ok(db.waLog.some((w) => w.Arah === 'IN'));
  assert.ok(db.waLog.some((w) => w.Nama === 'Brama' && w.Jenis === 'File final'));
});

test('reminder H-2/H-1/H, overdue, eskalasi, digest, dan rekap mingguan', async () => {
  const store = testStore();
  const brama = await userOf(store, 'Brama');
  const evi = await userOf(store, 'Evi');
  at('2026-10-27T02:00:00Z');
  await svc.submitRequest(store, brama, requestInput({ dueDate: '2026-10-30' }));
  await svc.cekBrief(store, evi, { requestId: 'CR-2610-001', decision: 'Lengkap', note: '' });

  at('2026-10-28T00:00:00Z'); // H-2
  let r = await runReminders(store);
  assert.equal(r.details.reminder, 1);
  r = await runReminders(store); // tidak dobel
  assert.equal(r.details.reminder, 0);

  at('2026-11-02T00:00:00Z'); // lewat 3 hari
  r = await runReminders(store);
  assert.equal(r.details.overdue, 1);
  assert.equal(r.details.escalated, 1);
  const db = await loadDb(store, { withWaLog: true });
  assert.ok(db.waLog.some((w) => w.Jenis === 'Eskalasi overdue' && w.Nama === 'Ammar Habibullah'));
  assert.ok(db.waLog.some((w) => w.Jenis === 'Eskalasi overdue' && w.Nama === 'Daniel Pranata'));

  const d = await runDigest(store);
  assert.equal(d.messages, 2);
  const w = await runWeekly(store);
  assert.equal(w.messages, 3);
  assert.equal(db.tasks[0].Status, STATUS.DIKERJAKAN);
});
