import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { computeBadges, markSeen, readSeen } from '../../lib/badges';
import { setClock } from '../../lib/clock';
import { loadDb } from '../../lib/db';
import * as svc from '../../lib/service';
import { at, requestInput, testStore, userOf } from './helpers';

afterEach(() => setClock(null));

test('badge merah sidebar per user, hilang setelah menu dibuka (poin 15)', async () => {
  const store = testStore();
  const brama = await userOf(store, 'Brama');
  const evi = await userOf(store, 'Evi');
  at('2026-10-27T02:00:00Z');
  const id = (await svc.submitRequest(store, brama, requestInput({ dueDate: '2026-11-13' }))).id!;
  await svc.submitRequest(store, brama, requestInput({ brand: 'Heylocal', dueDate: '2026-11-13' }));

  let db = await loadDb(store);
  const now = '2026-10-27 10:00';
  // Evi (Traffic Menswear): 1 request baru di grupnya; Brama tidak dihitung untuk request buatannya sendiri.
  assert.deepEqual(computeBadges(db, evi, {}, now), { requests: 1, tracker: 0, dashboard: 0 });
  assert.equal(computeBadges(db, brama, {}, now).requests, 0);

  // Evi membuka halaman Request → badge Request hilang, khusus untuk Evi.
  await store.append('Users', [{ Email: evi.email, Nama: 'Evi', Akses: 'User', Aktif: 'Ya' }]);
  db = await loadDb(store);
  assert.equal(await markSeen(store, db.accountRows, evi.email, 'requests', '2026-10-27 10:05'), true);
  db = await loadDb(store);
  assert.deepEqual(readSeen(db.accountRows, evi.email), { requests: '2026-10-27 10:05' });
  assert.equal(computeBadges(db, evi, readSeen(db.accountRows, evi.email), now).requests, 0);

  // Brief disetujui → task baru muncul di badge Tracker & Dashboard Evi
  at('2026-10-27T04:00:00Z');
  await svc.cekBrief(store, evi, { requestId: id, decision: 'Lengkap', note: '' });
  db = await loadDb(store);
  const b = computeBadges(db, evi, readSeen(db.accountRows, evi.email), '2026-10-27 11:00');
  assert.equal(b.tracker, 1);
  assert.equal(b.dashboard, 1);
});

test('ganti lead: Salsa dikeluarkan dari peran lead, task aktif & aturan kategori dialihkan (poin 16)', async () => {
  const { replaceLead } = await import('../../lib/leadAdmin');
  const store = testStore();
  const brama = await userOf(store, 'Brama');
  const evi = await userOf(store, 'Evi');
  const admin = { email: 'admin@x', name: 'Admin', roles: ['admin' as const], grup: 'Semua' };
  at('2026-10-27T02:00:00Z');
  const id = (
    await svc.submitRequest(
      store,
      brama,
      requestInput({ kategori: ['Fotoshoot'], subJenis: { Fotoshoot: ['Katalog'] }, details: { Fotoshoot: { jumlahSku: '4', lokasi: 'Studio', model: 'Ya' } }, dueDate: '2026-11-13' }),
    )
  ).id!;
  await svc.cekBrief(store, evi, { requestId: id, decision: 'Lengkap', note: '' });
  let db = await loadDb(store);
  assert.equal(db.tasks.find((t) => t.Divisi === 'Styling')!.Lead, 'Salsa Rosyidah');

  assert.equal((await replaceLead(store, evi, { from: 'Salsa Rosyidah', to: 'Hamzah Benoti', removeRole: true })).ok, false, 'khusus admin');
  const r = await replaceLead(store, admin, { from: 'Salsa Rosyidah', to: 'Hamzah Benoti', removeRole: true });
  assert.equal(r.ok, true, r.message);
  db = await loadDb(store);
  const st = db.tasks.find((t) => t.Divisi === 'Styling')!;
  assert.deepEqual([st.Lead, st.Assignee], ['Hamzah Benoti', 'Salsa Rosyidah'], 'task tetap dikerjakan Salsa, lead-nya diganti');
  const rule = db.master.kategori.find((k) => k.divisi === 'Styling')!;
  assert.deepEqual([rule.leadMenswear, rule.leadWomenswear], ['Hamzah Benoti', 'Hamzah Benoti']);
  const salsa = db.master.people.find((p) => p.name === 'Salsa Rosyidah')!;
  assert.equal(salsa.isLead, false);
  assert.equal(db.statusLog.some((l) => l.ID === st['Task ID'] && /Lead diganti: Salsa Rosyidah → Hamzah Benoti/.test(l.Catatan)), true);

  // Request berikutnya langsung memakai lead baru
  const id2 = (await svc.submitRequest(store, brama, requestInput({ kategori: ['Fotoshoot'], subJenis: { Fotoshoot: ['Katalog'] }, details: { Fotoshoot: { jumlahSku: '2', lokasi: 'Studio', model: 'Ya' } }, dueDate: '2026-11-13' }))).id!;
  await svc.cekBrief(store, evi, { requestId: id2, decision: 'Lengkap', note: '' });
  db = await loadDb(store);
  assert.equal(db.tasks.find((t) => t['Request ID'] === id2 && t.Divisi === 'Styling')!.Lead, 'Hamzah Benoti');
});
