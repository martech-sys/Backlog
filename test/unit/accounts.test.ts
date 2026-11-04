import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import * as acc from '../../lib/accounts';
import { setClock } from '../../lib/clock';
import { loadDb } from '../../lib/db';
import { env } from '../../lib/env';
import { signSession, verifySession } from '../../lib/token';
import { testStore } from './helpers';

const SECRET = 'test-secret-0123456789';
const boss: acc.Actor = { email: 'dodi.wahyono@worldwhiteenterprise.com', name: 'Dodi Wahyono', isSuperadmin: true };

beforeEach(() => {
  env.superadminEmail = 'dodi.wahyono@worldwhiteenterprise.com';
  env.superadminPassword = 'Awal12345';
});
afterEach(() => setClock(null));

test('hash scrypt: verifikasi benar/salah dan versi berubah tiap hash', async () => {
  const h = await acc.hashPassword('rahasia123', 1024);
  assert.match(h, /^scrypt\$1024\$8\$1\$/);
  assert.equal(await acc.verifyPassword('rahasia123', h), true);
  assert.equal(await acc.verifyPassword('Rahasia123', h), false);
  assert.equal(await acc.verifyPassword('x', 'bukan-hash'), false);
  const h2 = await acc.hashPassword('rahasia123', 1024);
  assert.notEqual(acc.passwordVersion(h), acc.passwordVersion(h2));
  assert.equal(acc.validateNewPassword('pendek1'), 'Password minimal 8 karakter.');
  assert.match(acc.validateNewPassword('hanyahuruf') || '', /huruf dan angka/);
  assert.equal(acc.validateNewPassword('abc12345'), null);
  assert.match(acc.generatePassword(), /^[a-z]{3}\d{4}[a-z]{3}$/);
});

test('token sesi: tanda tangan, pemalsuan, dan kedaluwarsa', async () => {
  const t = await signSession({ e: 'a@b.c', v: 'v1', m: 0 }, SECRET);
  assert.equal((await verifySession(t, SECRET))?.e, 'a@b.c');
  assert.equal(await verifySession(t, 'rahasia-lain'), null);
  const [body, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ e: 'admin@x.com', v: 'v1', m: 0, x: 9e9 })).toString('base64url');
  assert.equal(await verifySession(`${forged}.${sig}`, SECRET), null);
  assert.equal(await verifySession(`${body}.`, SECRET), null);
  const old = await signSession({ e: 'a@b.c', v: 'v1', m: 0, x: Math.floor(Date.now() / 1000) - 1 }, SECRET);
  assert.equal(await verifySession(old, SECRET), null);
});

test('superadmin awal login dengan password env, lalu wajib buat password pribadi', async () => {
  const store = testStore();
  const r = await acc.authenticate(store, 'Dodi.Wahyono@worldwhiteenterprise.com', 'Awal12345');
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.session, { e: 'dodi.wahyono@worldwhiteenterprise.com', v: acc.ENV_VERSION, m: 1 });

  const bad = await acc.changeOwnPassword(store, boss.email, 'salah', 'Pribadi123', true);
  assert.equal(bad.ok, false);
  const ch = await acc.changeOwnPassword(store, boss.email, 'Awal12345', 'Pribadi123', true);
  assert.equal(ch.ok, true, ch.message);
  assert.equal(ch.session?.m, 0);
  const again = await acc.authenticate(store, boss.email, 'Pribadi123');
  assert.equal(again.ok, true);
  assert.equal(again.session?.v, ch.session?.v);
  assert.equal(again.session?.m, 0);
});

test('superadmin menambah user, user login, wajib ganti password', async () => {
  const store = testStore();
  const u = { email: 'Evi@Heymale.id', nama: 'Evi', akses: 'User', password: 'Sementara1', mustChange: true };
  assert.equal((await acc.createAccount(store, { ...boss, isSuperadmin: false }, u)).ok, false, 'bukan superadmin');
  assert.equal((await acc.createAccount(store, boss, { ...u, password: 'pendek' })).ok, false);
  assert.equal((await acc.createAccount(store, boss, { ...u, email: 'bukan-email' })).ok, false);
  const created = await acc.createAccount(store, boss, u);
  assert.equal(created.ok, true, created.message);
  assert.match(created.message, /terhubung ke Evi \(Traffic\)/);
  assert.equal((await acc.createAccount(store, boss, u)).ok, false, 'email duplikat');

  const db = await loadDb(store);
  const row = db.accountRows.find((r) => r.Email === 'evi@heymale.id')!;
  assert.match(row['Password Hash'], /^scrypt\$/);
  assert.ok(!JSON.stringify(row).includes('Sementara1'), 'password tidak tersimpan sebagai teks');

  const login = await acc.authenticate(store, 'evi@heymale.id', 'Sementara1');
  assert.deepEqual([login.ok, login.session?.m], [true, 1]);
  const after = await loadDb(store);
  assert.ok(after.accounts.find((a) => a.email === 'evi@heymale.id')!.lastLogin);
});

test('reset password membuat sesi lama tidak berlaku; nonaktif tidak bisa login', async () => {
  const store = testStore();
  await acc.createAccount(store, boss, { email: 'tiwi@heymale.id', nama: 'Tiwi', akses: 'User', password: 'Tiwi12345', mustChange: false });
  const first = await acc.authenticate(store, 'tiwi@heymale.id', 'Tiwi12345');
  assert.equal(first.session?.m, 0);
  assert.equal((await acc.resetPassword(store, boss, 'tiwi@heymale.id', 'Baru12345')).ok, true);
  const db = await loadDb(store);
  const tiwi = db.accounts.find((a) => a.email === 'tiwi@heymale.id')!;
  assert.notEqual(acc.passwordVersion(tiwi.hash), first.session?.v, 'versi berubah → token lama ditolak');
  assert.equal(tiwi.mustChange, true);
  assert.equal((await acc.authenticate(store, 'tiwi@heymale.id', 'Tiwi12345')).ok, false);

  assert.equal((await acc.updateAccount(store, boss, 'tiwi@heymale.id', { aktif: false })).ok, true);
  const off = await acc.authenticate(store, 'tiwi@heymale.id', 'Baru12345');
  assert.deepEqual([off.ok, off.message], [false, 'Akun ini dinonaktifkan. Hubungi Superadmin.']);
});

test('tidak bisa menurunkan diri sendiri atau menghapus superadmin terakhir', async () => {
  const store = testStore();
  assert.match((await acc.updateAccount(store, boss, boss.email, { akses: 'User' })).message, /akunmu sendiri/);
  await acc.createAccount(store, boss, { email: 'lain@x.com', nama: 'Lain', akses: 'Superadmin', password: 'Lain12345', mustChange: false });
  const other: acc.Actor = { email: 'lain@x.com', name: 'Lain', isSuperadmin: true };
  assert.equal((await acc.updateAccount(store, other, boss.email, { akses: 'Admin' })).ok, true);
  assert.match((await acc.updateAccount(store, boss, 'lain@x.com', { aktif: false })).message, /minimal satu Superadmin/);
});

test('5 kali salah password → dikunci sementara', async () => {
  const store = testStore();
  await acc.createAccount(store, boss, { email: 'mey@heymale.id', nama: 'Mey', akses: 'User', password: 'Mey123456', mustChange: false });
  for (let i = 0; i < 5; i++) assert.equal((await acc.authenticate(store, 'mey@heymale.id', 'salah')).ok, false);
  const locked = await acc.authenticate(store, 'mey@heymale.id', 'Mey123456');
  assert.equal(locked.ok, false);
  assert.match(locked.message, /Terlalu banyak percobaan/);
});
