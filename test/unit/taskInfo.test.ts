import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TaskRow } from '../../lib/config';
import { bySubmittedDesc, taskHealth, taskTitle } from '../../lib/taskInfo';

const task = (over: Partial<TaskRow>) => ({ 'Task ID': 'CR-2611-001-PE', Judul: '', Status: 'Dikerjakan', Deadline: '', Dibuat: '', 'Request ID': 'CR-2611-001', ...over }) as TaskRow;

test('judul task: judul task → judul request → campaign → ID', () => {
  assert.equal(taskTitle(task({ Judul: 'Makeover 1' }), { Judul: 'Makeover', 'Campaign Name': 'USS' }), 'Makeover 1');
  assert.equal(taskTitle(task({}), { Judul: 'Makeover', 'Campaign Name': 'USS' }), 'Makeover');
  assert.equal(taskTitle(task({}), { Judul: '', 'Campaign Name': 'USS' }), 'USS');
  assert.equal(taskTitle(task({})), 'CR-2611-001-PE');
});

test('urutan tracker: pengajuan terbaru di atas, stabil per ID', () => {
  const req = new Map([
    ['CR-2611-001', { Timestamp: '2026-11-04 10:04' }],
    ['CR-2611-002', { Timestamp: '2026-11-16 10:27' }],
  ]);
  const rows = [
    task({ 'Task ID': 'CR-2611-001-PE', 'Request ID': 'CR-2611-001' }),
    task({ 'Task ID': 'CR-2611-002-PE10', 'Request ID': 'CR-2611-002' }),
    task({ 'Task ID': 'CR-2611-002-PE2', 'Request ID': 'CR-2611-002' }),
  ].sort(bySubmittedDesc(req));
  assert.deepEqual(
    rows.map((t) => t['Task ID']),
    ['CR-2611-002-PE2', 'CR-2611-002-PE10', 'CR-2611-001-PE'],
  );
});

test('Task Health 5 tingkat dari sisa hari terhadap deadline', () => {
  const today = '2026-11-17';
  const h = (Deadline: string, Status = 'Dikerjakan') => taskHealth(task({ Deadline, Status }), today)?.badge ?? null;
  assert.equal(h('2026-11-25'), 'ON TRACK');
  assert.equal(h('2026-11-20'), 'ON TRACK');
  assert.equal(h('2026-11-19'), 'URGENT');
  assert.equal(h('2026-11-17'), 'URGENT');
  assert.equal(h('2026-11-16'), 'VERY URGENT');
  assert.equal(h('2026-11-15'), 'OVERDUE');
  assert.equal(h('2026-11-14'), 'CRITICAL');
  assert.equal(h('2026-10-01'), 'CRITICAL');
  assert.equal(h('2026-11-10', 'Final'), null, 'task Final tidak diberi label');
  assert.equal(h(''), 'ON TRACK');
});
