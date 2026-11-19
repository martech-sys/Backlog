import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { categoryDefs } from '../../lib/categories';
import { setClock } from '../../lib/clock';
import { loadDb } from '../../lib/db';
import * as svc from '../../lib/service';
import { at, requestInput, testStore, userOf } from './helpers';

afterEach(() => setClock(null));

test('request jumlah N otomatis dipecah jadi N task (poin 8)', async () => {
  const store = testStore();
  const brama = await userOf(store, 'Brama');
  const evi = await userOf(store, 'Evi');
  at('2026-10-27T02:00:00Z');
  const sub = await svc.submitRequest(
    store,
    brama,
    requestInput({
      judul: 'Makeover at USS',
      kategori: ['Photo editing', 'Desain grafis'],
      subJenis: { 'Photo editing': ['Retouch produk'], 'Desain grafis': ['Poster'] },
      details: {
        'Photo editing': { folderMentah: 'https://drive.google.com/x', jumlahFoto: '3', format: 'JPG' },
        'Desain grafis': { ukuran: '4:5', jumlahDesain: '1' },
      },
      dueDate: '2026-11-13',
    }),
  );
  assert.equal(sub.ok, true, sub.message);

  const r0 = (await loadDb(store)).requests[0];
  const defs = categoryDefs((await loadDb(store)).master);
  assert.deepEqual(svc.splitPlan(r0, defs), [{ kategori: 'Photo editing', label: 'Jumlah foto', n: 3 }]);

  const ok = await svc.cekBrief(store, evi, { requestId: sub.id!, decision: 'Lengkap', note: '' });
  assert.equal(ok.ok, true, ok.message);
  assert.match(ok.message, /4 task dibuat \(Photo editing: 3 task\)/);

  const db = await loadDb(store);
  const pe = db.tasks.filter((t) => t.Kategori === 'Photo editing');
  assert.deepEqual(
    pe.map((t) => [t['Task ID'], t.Judul]),
    [
      [`${sub.id}-PE1`, 'Makeover at USS 1'],
      [`${sub.id}-PE2`, 'Makeover at USS 2'],
      [`${sub.id}-PE3`, 'Makeover at USS 3'],
    ],
  );
  const dg = db.tasks.find((t) => t.Kategori === 'Desain grafis')!;
  assert.deepEqual([dg['Task ID'], dg.Judul], [`${sub.id}-DG`, 'Makeover at USS'], 'jumlah 1 tidak dipecah');
  // Brief lain ikut request induk
  assert.ok(pe.every((t) => t.Brand === 'Heymale' && t.Deadline === '2026-11-13'));
});

test('jumlah pemecahan dibatasi', async () => {
  const store = testStore();
  const brama = await userOf(store, 'Brama');
  at('2026-10-27T02:00:00Z');
  const r = await svc.submitRequest(
    store,
    brama,
    requestInput({ details: { 'Desain grafis': { ukuran: '4:5', jumlahDesain: '500' } } }),
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors?.['detail:Desain grafis:jumlahDesain']);
});

test('approve / tolak request secara massal (poin 10)', async () => {
  const store = testStore();
  const brama = await userOf(store, 'Brama');
  const evi = await userOf(store, 'Evi');
  at('2026-10-27T02:00:00Z');
  const ids: string[] = [];
  for (let i = 0; i < 4; i++) ids.push((await svc.submitRequest(store, brama, requestInput({ dueDate: '2026-11-13' }))).id!);

  const noNote = await svc.bulkCekBrief(store, evi, ids.slice(2), 'Kurang', '');
  assert.equal(noNote.ok, false, 'tolak wajib alasan');

  const ok = await svc.bulkCekBrief(store, evi, [ids[0], ids[1], 'CR-0000-999'], 'Lengkap', '');
  assert.deepEqual(ok.done, [ids[0], ids[1]]);
  assert.equal(ok.failed.length, 1);
  assert.match(ok.message, /^2 dari 3 request disetujui\. Gagal: CR-0000-999/);

  const rej = await svc.bulkCekBrief(store, evi, ids.slice(2), 'Kurang', 'Lengkapi referensi visual');
  assert.equal(rej.ok, true, rej.message);
  const db = await loadDb(store);
  assert.deepEqual(
    db.requests.map((r) => r.Status),
    ['Diproses', 'Diproses', 'Brief Kurang', 'Brief Kurang'],
  );
  assert.equal(db.tasks.length, 2, 'tiap request yang disetujui jadi task sesuai default kategori');
  assert.ok(db.tasks.every((t) => t.Lead && t.Assignee), 'lead & assignee terisi otomatis dari default kategori');

  const pic = await svc.bulkCekBrief(store, brama, [ids[2]], 'Lengkap', '');
  assert.equal(pic.ok, false, 'PIC brand tidak boleh approve');
});

test('detail task selesai bisa dikoreksi & task bisa dihapus (arsip) lalu dikembalikan (poin 13, 14)', async () => {
  const store = testStore();
  const brama = await userOf(store, 'Brama');
  const evi = await userOf(store, 'Evi');
  const admin = { email: 'admin@x', name: 'Admin', roles: ['admin' as const], grup: 'Semua' };
  at('2026-10-27T02:00:00Z');
  const a = (await svc.submitRequest(store, brama, requestInput({ dueDate: '2026-11-13' }))).id!;
  const b = (await svc.submitRequest(store, brama, requestInput({ dueDate: '2026-11-13' }))).id!;
  await svc.bulkCekBrief(store, evi, [a, b], 'Lengkap', '');
  let db = await loadDb(store);
  const ta = db.tasks.find((t) => t['Request ID'] === a)!;
  const tb = db.tasks.find((t) => t['Request ID'] === b)!;

  // Poin 13: task masih dikerjakan → belum bisa dikoreksi lewat panel Detail
  const edit = { pic: 'Brama', lead: 'Aulia Pramudya', assignee: 'Desainer B', targetDraft: '2026-11-11', deadline: '2026-11-14', selesaiPada: '' };
  assert.equal((await svc.editClosedDetail(store, evi, ta['Task ID'], edit)).ok, false);
  await svc.overrideStatus(store, admin, ta['Task ID'], 'Selesai', 'tes');
  const ed = await svc.editClosedDetail(store, evi, ta['Task ID'], { ...edit, selesaiPada: '2026-11-12T16:30' });
  assert.equal(ed.ok, true, ed.message);
  db = await loadDb(store);
  const after = db.tasks.find((t) => t['Task ID'] === ta['Task ID'])!;
  assert.deepEqual([after.Assignee, after.Deadline, after['Selesai Pada'], after.Status], ['Desainer B', '2026-11-14', '2026-11-12 16:30', 'Selesai']);
  const log = db.statusLog.filter((l) => l.ID === ta['Task ID']).pop()!;
  assert.match(log.Catatan, /Detail dikoreksi.*Assignee: .* → Desainer B/);
  assert.equal(log.Oleh, 'Evi');
  assert.equal((await svc.editClosedDetail(store, brama, ta['Task ID'], edit)).ok, false, 'PIC tidak boleh');

  // Poin 14: hanya admin; task hilang dari daftar, request ikut selesai bila sisanya selesai
  assert.equal((await svc.archiveTask(store, evi, tb['Task ID'], '')).ok, false);
  assert.equal((await svc.archiveTask(store, admin, tb['Task ID'], 'salah input')).ok, true);
  db = await loadDb(store);
  assert.equal(db.tasks.some((t) => t['Task ID'] === tb['Task ID']), false);
  assert.equal(db.archivedTasks.length, 1);
  assert.match(db.archivedTasks[0].Diarsipkan, /Admin · salah input$/);
  assert.equal((await svc.restoreTask(store, admin, tb['Task ID'])).ok, true);
  db = await loadDb(store);
  assert.equal(db.tasks.some((t) => t['Task ID'] === tb['Task ID']), true);
  assert.equal(db.archivedTasks.length, 0);
});
