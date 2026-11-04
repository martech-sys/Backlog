import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { STATUS } from '../../lib/config';
import { now, runSimulation, setClock } from '../../lib/clock';
import { loadDb } from '../../lib/db';
import { countSample, generateSample, purgeSample } from '../../lib/sample';
import * as svc from '../../lib/service';
import { at, requestInput, testStore, userOf } from './helpers';

afterEach(() => setClock(null));

test('jam simulasi terisolasi dari jam server', async () => {
  const before = Date.now();
  await runSimulation(async () => {
    setClock(new Date('2020-01-01T00:00:00Z'));
    assert.equal(now().getUTCFullYear(), 2020);
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(now().getUTCFullYear(), 2020);
  });
  assert.ok(now().getTime() >= before, 'jam di luar simulasi tidak berubah');
});

test('buat data contoh: semua status terisi, lalu hapus tanpa menyentuh data asli', async () => {
  const store = testStore();
  // Satu request asli sebelum data contoh dibuat
  at('2026-10-27T02:00:00Z');
  const real = await svc.submitRequest(store, await userOf(store, 'Brama'), requestInput());
  setClock(null);
  assert.equal(real.id, 'CR-2610-001');

  const c = await generateSample(store);
  assert.ok(c.requests >= 50, `request contoh ${c.requests}`);
  assert.ok(c.statusLog > c.tasks * 3);
  assert.equal(c.members, 8);
  await assert.rejects(generateSample(store), /sudah ada/);

  const db = await loadDb(store, { withWaLog: true });
  const demoTasks = db.tasks.filter((t) => t['Task ID'].startsWith('DEMO-'));
  const statuses = new Set(demoTasks.map((t) => t.Status));
  for (const s of [STATUS.SIAP_ASSIGN, STATUS.DIKERJAKAN, STATUS.QC_LEAD, STATUS.REVISI_INTERNAL, STATUS.REVIEW_BRAND, STATUS.REVISI_BRAND, STATUS.ACC, STATUS.FINAL, STATUS.SELESAI]) {
    assert.ok(statuses.has(s), `ada task berstatus ${s}`);
  }
  const reqStatuses = new Set(db.requests.filter((r) => r['Request ID'].startsWith('DEMO-')).map((r) => r.Status));
  assert.ok(reqStatuses.has(STATUS.BARU) && reqStatuses.has(STATUS.BRIEF_KURANG));
  assert.ok(db.master.people.some((p) => p.name === 'Desainer 1 (contoh)'));
  assert.ok(db.waLog.filter((w) => w['Ref ID'].startsWith('DEMO-')).every((w) => w.Hasil.startsWith('DRY_RUN')), 'WA contoh tidak dikirim');
  const nowTs = Date.now() + 7 * 3600e3 + 60e3;
  assert.ok(db.statusLog.every((l) => Date.parse(l.Timestamp.replace(' ', 'T') + ':00Z') <= nowTs), 'tidak ada waktu di masa depan');

  const removed = await purgeSample(store);
  assert.equal(removed.requests, c.requests);
  assert.deepEqual(await countSample(store), { requests: 0, tasks: 0, statusLog: 0, waLog: 0, members: 0 });
  const after = await loadDb(store, { withWaLog: true });
  assert.deepEqual(after.requests.map((r) => r['Request ID']), ['CR-2610-001'], 'request asli tetap ada');
  assert.ok(after.statusLog.some((l) => l.ID === 'CR-2610-001'));
  assert.ok(after.waLog.some((w) => w['Ref ID'] === 'CR-2610-001'));
});
