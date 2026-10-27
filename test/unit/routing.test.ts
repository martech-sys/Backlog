import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadDb } from '../../lib/db';
import { buildTaskDrafts, isUrgent, nextTicketId, pickLeastLoaded, routeRequest } from '../../lib/routing';
import { testStore } from './helpers';

test('brand menentukan grup, Traffic, dan Creative Head', async () => {
  const db = await loadDb(testStore());
  const m = routeRequest(db.master, 'Heymale', ['Desain grafis']);
  assert.deepEqual([m.grup, m.traffic, m.creativeHead], ['Menswear', 'Evi', 'Ammar Habibullah']);
  const w = routeRequest(db.master, 'Shuwa', ['Videografis', 'Fotoshoot']);
  assert.deepEqual([w.grup, w.traffic, w.creativeHead], ['Womenswear', 'Nadia Syifa', 'Abdul Malik']);
  assert.equal(w.leadTimeMin, 7);
});

test('Fotoshoot dipecah jadi Foto + Styling dengan lead sesuai grup', async () => {
  const db = await loadDb(testStore());
  const mens = buildTaskDrafts({ master: db.master, grup: 'Menswear', kategoriList: ['Fotoshoot'], deadline: '2026-11-10', today: '2026-10-27', existingTasks: [] });
  assert.deepEqual(mens.map((d) => [d.divisi, d.lead, d.assignee]), [
    ['Foto', 'Ahmad Husen', ''],
    ['Styling', 'Salsa Rosyidah', 'Salsa Rosyidah'],
  ]);
  const womens = buildTaskDrafts({ master: db.master, grup: 'Womenswear', kategoriList: ['Fotoshoot'], deadline: '2026-11-10', today: '2026-10-27', existingTasks: [] });
  assert.equal(womens[0].lead, 'Hamzah Benoti');
  assert.equal(mens[0].targetDraft, '2026-11-06'); // 10 Nov (Selasa) - 2 hari kerja
});

test('desain grafis otomatis ke desainer dengan beban paling ringan', async () => {
  const db = await loadDb(testStore());
  const busyA = [{ Assignee: 'Desainer A', Status: 'Dikerjakan' }];
  assert.equal(pickLeastLoaded(db.master, 'Desain', 'Menswear', new Map([['Desainer A', 2]]))?.name, 'Desainer B');
  const drafts = buildTaskDrafts({ master: db.master, grup: 'Menswear', kategoriList: ['Desain grafis'], deadline: '2026-11-10', today: '2026-10-27', existingTasks: busyA });
  assert.equal(drafts[0].assignee, 'Desainer B');
  assert.equal(drafts[0].lead, 'Aulia Pramudya');
});

test('3D/Motion langsung ke pelaksana default', async () => {
  const db = await loadDb(testStore());
  const d = buildTaskDrafts({ master: db.master, grup: 'Womenswear', kategoriList: ['3D/Motion'], deadline: '2026-11-20', today: '2026-10-27', existingTasks: [] });
  assert.deepEqual([d[0].lead, d[0].assignee], ['Aulia Pramudya', 'Habibi Al Huda']);
});

test('URGENT bila sisa hari kerja < lead time minimum', () => {
  const none = new Set<string>();
  assert.equal(isUrgent('2026-10-27', '2026-10-29', 3, none), true);
  assert.equal(isUrgent('2026-10-27', '2026-10-30', 3, none), false);
});

test('ID tiket berurutan per bulan', () => {
  assert.equal(nextTicketId('CR', '2026-10-27', []), 'CR-2610-001');
  assert.equal(nextTicketId('CR', '2026-10-27', ['CR-2610-001', 'CR-2610-009', 'CR-2609-050']), 'CR-2610-010');
  assert.equal(nextTicketId('CR', '2026-11-01', ['CR-2610-010']), 'CR-2611-001');
});

test('REMINDER_DAYS tahan terhadap nilai rusak dari Sheets', async () => {
  const { parseReminderDays } = await import('../../lib/master');
  assert.deepEqual(parseReminderDays('2,1,0'), [2, 1, 0]);
  assert.deepEqual(parseReminderDays('3; 1'), [3, 1]);
  assert.deepEqual(parseReminderDays('2,1,2000'), [2, 1]);
  assert.deepEqual(parseReminderDays('36527'), [2, 1, 0]);
});

test('email admin di Config boleh login walau di luar domain kantor', async () => {
  const { buildMaster } = await import('../../lib/master');
  const { isAllowedEmail, resolveUser } = await import('../../lib/users');
  const master = buildMaster({
    config: [{ Key: 'ADMIN_EMAILS', Value: 'Dodi.Wahyono@worldwhiteenterprise.com', Keterangan: '', _row: 2 }],
    grup: [],
    brand: [],
    pic: [],
    tim: [],
    kategori: [],
    libur: [],
  });
  assert.equal(isAllowedEmail(master, 'dodi.wahyono@worldwhiteenterprise.com'), true);
  assert.equal(isAllowedEmail(master, 'orang.lain@worldwhiteenterprise.com'), false);
  assert.equal(isAllowedEmail(master, 'siapa.saja@heymale.id'), true);
  const u = resolveUser(master, 'dodi.wahyono@worldwhiteenterprise.com', 'Dodi Wahyono');
  assert.deepEqual([u?.name, u?.roles.includes('admin')], ['Dodi Wahyono', true]);
});
