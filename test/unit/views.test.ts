import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { laneOf, priorityOf, buildBoards } from '../../lib/backlog';
import { STATUS, type TaskRow } from '../../lib/config';
import { setClock } from '../../lib/clock';
import { computeDashboard, defaultFilters } from '../../lib/dashboard';
import { loadDb } from '../../lib/db';
import * as svc from '../../lib/service';
import { columnLetter, rowsFromValues } from '../../lib/store/sheets';
import { at, requestInput, testStore, userOf } from './helpers';

afterEach(() => setClock(null));

const task = (over: Partial<TaskRow>): TaskRow =>
  ({ Status: STATUS.DIKERJAKAN, Deadline: '2026-11-10', Urgent: 'Tidak', 'Versi Draft': '0', 'Selesai Pada': '', ...over }) as TaskRow;

test('papan backlog: kolom dan prioritas', () => {
  const today = '2026-10-27';
  assert.equal(laneOf(task({}), today), 'todo');
  assert.equal(laneOf(task({ 'Versi Draft': '2', Status: STATUS.REVISI_BRAND }), today), 'ongoing');
  assert.equal(laneOf(task({ Status: STATUS.REVIEW_BRAND }), today), 'onHold');
  assert.equal(laneOf(task({ Urgent: 'Ya' }), today), 'unplanned');
  assert.equal(laneOf(task({ Deadline: '2026-10-20' }), today), 'blocker');
  assert.equal(laneOf(task({ Status: STATUS.SELESAI, 'Selesai Pada': '2026-10-25 10:00' }), today), 'done');
  assert.equal(laneOf(task({ Status: STATUS.SELESAI, 'Selesai Pada': '2026-09-01 10:00' }), today), null);
  assert.deepEqual([priorityOf(0, false), priorityOf(3, false), priorityOf(9, false), priorityOf(9, true)], ['high', 'med', 'low', 'high']);
});

test('dashboard dan papan dihitung dari data tracker', async () => {
  const store = testStore();
  const brama = await userOf(store, 'Brama');
  const evi = await userOf(store, 'Evi');
  const aulia = await userOf(store, 'Aulia Pramudya');
  at('2026-10-27T02:00:00Z');
  await svc.submitRequest(store, brama, requestInput());
  await svc.submitRequest(store, brama, requestInput({ brand: 'Zoma' }));
  await svc.cekBrief(store, evi, { requestId: 'CR-2610-001', decision: 'Lengkap', note: '' });
  at('2026-10-28T02:00:00Z');
  const db0 = await loadDb(store);
  const id = db0.tasks[0]['Task ID'];
  const who = await userOf(store, db0.tasks[0].Assignee);
  await svc.submitDraft(store, who, id, 'https://x.test/v1');
  at('2026-10-29T02:00:00Z');
  await svc.qcDecision(store, aulia, id, true, '');

  const db = await loadDb(store);
  const now = new Date('2026-10-30T02:00:00Z');
  const d = computeDashboard({ ...db, filters: defaultFilters('2026-10-30'), now });
  assert.equal(d.kpi.requestsIn, 2);
  assert.equal(d.requestsPerBrand.find((b) => b.brand === 'Heymale')?.count, 1);
  assert.equal(d.statusPosition.find((s) => s.status === STATUS.BARU)?.count, 1);
  assert.equal(d.statusPosition.find((s) => s.status === STATUS.REVIEW_BRAND)?.count, 1);
  const qc = d.stageDurations.find((s) => s.stage === 'QC lead')!;
  assert.equal(qc.avgDays, 1);
  const review = d.stageDurations.find((s) => s.stage === 'Review brand')!;
  assert.equal(review.avgDays, 1);
  assert.equal(review.side, 'brand');

  const boards = buildBoards({ master: db.master, tasks: db.tasks, statusLog: db.statusLog, today: '2026-10-30', groupBy: 'anggota' });
  const card = boards.find((b) => b.title === db.tasks[0].Assignee)!;
  assert.equal(card.lanes.onHold.length, 1);
  assert.equal(card.load, 1);
  const byBrand = buildBoards({ master: db.master, tasks: db.tasks, statusLog: db.statusLog, today: '2026-10-30', groupBy: 'brand' });
  assert.equal(byBrand.length, 11);
});

test('adapter Google Sheets: header → objek, kolom A1', () => {
  assert.deepEqual([columnLetter(0), columnLetter(25), columnLetter(26), columnLetter(31)], ['A', 'Z', 'AA', 'AF']);
  const rows = rowsFromValues([
    ['Task ID', 'Deadline', 'Versi Draft'],
    ['CR-2610-001-1', 46325, 2],
    [],
    ['CR-2610-001-2', '2026-11-02'],
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0]['Task ID'], rows[0].Deadline, rows[0]['Versi Draft'], rows[0]._row], ['CR-2610-001-1', '2026-10-30', '2', 2]);
  assert.equal(rows[1]._row, 4);
  assert.equal(rows[1]['Versi Draft'], '');
});
