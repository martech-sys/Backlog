import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addWorkingDays,
  diffDays,
  formatWib,
  normalizeCellDate,
  todayWib,
  workingDaysBetween,
} from '../../lib/dates';

const none = new Set<string>();

test('formatWib memakai zona WIB (UTC+7)', () => {
  assert.equal(formatWib(new Date('2026-10-26T18:30:00Z')), '2026-10-27 01:30');
  assert.equal(todayWib(new Date('2026-10-26T16:59:00Z')), '2026-10-26');
  assert.equal(todayWib(new Date('2026-10-26T17:00:00Z')), '2026-10-27');
});

test('hari kerja melewati akhir pekan dan libur', () => {
  // 2026-10-30 = Jumat
  assert.equal(addWorkingDays('2026-10-30', 1, none), '2026-11-02');
  assert.equal(addWorkingDays('2026-11-02', -1, none), '2026-10-30');
  assert.equal(addWorkingDays('2026-10-30', 1, new Set(['2026-11-02'])), '2026-11-03');
  assert.equal(workingDaysBetween('2026-10-30', '2026-11-03', none), 2);
  assert.equal(workingDaysBetween('2026-10-27', '2026-10-27', none), 0);
  assert.equal(workingDaysBetween('2026-11-03', '2026-10-30', none), -2);
  assert.equal(diffDays('2026-10-27', '2026-11-01'), 5);
});

test('normalizeCellDate menerima serial Sheets, ISO, dan format lokal', () => {
  assert.equal(normalizeCellDate(46322), '2026-10-27');
  assert.equal(normalizeCellDate(46322.5), '2026-10-27 12:00');
  assert.equal(normalizeCellDate('2026-10-27 9:05'), '2026-10-27 09:05');
  assert.equal(normalizeCellDate('27/10/2026'), '2026-10-27');
  assert.equal(normalizeCellDate(''), '');
});
