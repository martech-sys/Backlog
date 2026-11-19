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
