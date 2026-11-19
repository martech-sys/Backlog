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
