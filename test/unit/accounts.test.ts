import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import * as acc from '../../lib/accounts';
import { setClock } from '../../lib/clock';
import { loadDb } from '../../lib/db';
import { env } from '../../lib/env';
import type { WorkProfile } from '../../lib/people';
import { signSession, verifySession } from '../../lib/token';
import { testStore } from './helpers';

const SECRET = 'test-secret-0123456789';

/** Input createAccount: peran default Staff Desain. */
function mk(email: string, nama: string, akses: string, password: string, mustChange: boolean, over: Partial<WorkProfile> = {}): acc.CreateInput {
  return {
    email,
    akses,
    password,
    mustChange,
    profile: { nama, peran: akses === 'User' ? 'Staff' : '', sisi: 'Semua', divisi: 'Desain', jabatan: '', brands: [], phone: '', kapasitas: '', ...over },
  };
}
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
  const u = mk('Evi@Heymale.id', 'Evi', 'User', 'Sementara1', true, { peran: 'Traffic', sisi: 'Menswear', divisi: '' });
  assert.equal((await acc.createAccount(store, { ...boss, isSuperadmin: false }, u)).ok, false, 'bukan superadmin');
  assert.equal((await acc.createAccount(store, boss, { ...u, password: 'pendek' })).ok, false);
  assert.equal((await acc.createAccount(store, boss, { ...u, email: 'bukan-email' })).ok, false);
  assert.match((await acc.createAccount(store, boss, { ...u, email: 'x@y.id', profile: { ...u.profile, peran: '' } })).message, /Peran kerja wajib/);
  const created = await acc.createAccount(store, boss, u);
  assert.equal(created.ok, true, created.message);
  assert.match(created.message, /Traffic · Menswear/);
  assert.match(created.invite!.link, /\/undangan\?token=/);
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
  await acc.createAccount(store, boss, mk('tiwi@heymale.id', 'Tiwi', 'User', 'Tiwi12345', false, { peran: 'PIC brand', sisi: 'Womenswear' }));
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
  await acc.createAccount(store, boss, mk('lain@x.com', 'Lain', 'Superadmin', 'Lain12345', false));
  const other: acc.Actor = { email: 'lain@x.com', name: 'Lain', isSuperadmin: true };
  assert.equal((await acc.updateAccount(store, other, boss.email, { akses: 'Admin' })).ok, true);
  assert.match((await acc.updateAccount(store, boss, 'lain@x.com', { aktif: false })).message, /minimal satu Superadmin/);
});

test('5 kali salah password → dikunci sementara', async () => {
  const store = testStore();
  await acc.createAccount(store, boss, mk('mey@heymale.id', 'Mey', 'User', 'Mey123456', false, { peran: 'PIC brand', sisi: 'Womenswear' }));
  for (let i = 0; i < 5; i++) assert.equal((await acc.authenticate(store, 'mey@heymale.id', 'salah')).ok, false);
  const locked = await acc.authenticate(store, 'mey@heymale.id', 'Mey123456');
  assert.equal(locked.ok, false);
  assert.match(locked.message, /Terlalu banyak percobaan/);
});

test('undangan: tanpa password awal, link sekali pakai 72 jam, lalu langsung login', async () => {
  const store = testStore();
  const r = await acc.createAccount(store, boss, mk('baru@heymale.id', 'Rina Baru', 'User', '', false, { divisi: 'Desain', jabatan: 'Graphic Designer' }));
  assert.equal(r.ok, true, r.message);
  assert.match(r.message, /belum terkirim.*SMTP/);
  const login = await acc.authenticate(store, 'baru@heymale.id', 'apa-saja1');
  assert.match(login.message, /belum aktif/);

  const token = new URL(r.invite!.link).searchParams.get('token')!;
  assert.deepEqual(await acc.checkInvite(store, token), { ok: true, email: 'baru@heymale.id', nama: 'Rina Baru' });
  assert.equal((await acc.checkInvite(store, 'salah')).ok, false);
  const ok = await acc.acceptInvite(store, token, 'RinaPass99');
  assert.equal(ok.ok, true, ok.message);
  assert.equal(ok.session?.m, 0);
  assert.equal((await acc.acceptInvite(store, token, 'RinaPass99')).ok, false, 'sekali pakai');
  assert.equal((await acc.authenticate(store, 'baru@heymale.id', 'RinaPass99')).ok, true);

  // kedaluwarsa
  await acc.sendInvite(store, 'baru@heymale.id', 'Dodi');
  const db = await loadDb(store, { withWaLog: true });
  assert.ok(db.accounts.find((a) => a.email === 'baru@heymale.id')!.inviteHash);
  setClock(new Date(Date.now() + 73 * 3600e3));
  const db2 = await loadDb(store);
  const exp = db2.accounts.find((a) => a.email === 'baru@heymale.id')!;
  assert.ok(Date.parse(exp.inviteExpires) < Date.now() + 73 * 3600e3);
});

test('peran kerja: tambah, ubah, dan routing langsung memakai peran baru', async () => {
  const store = testStore();
  await acc.createAccount(store, boss, mk('rani@heymale.id', 'Rani Traffic', 'User', 'Rani12345', false, { peran: 'Staff', divisi: 'Desain' }));
  let db = await loadDb(store);
  let p = db.master.people.find((x) => x.name === 'Rani Traffic')!;
  assert.deepEqual([p.divisi, p.roles, p.email], ['Desain', ['tim'], 'rani@heymale.id']);

  // Ubah jadi Traffic Menswear; Evi dinonaktifkan dari peran Traffic → request Menswear ke Rani
  const ed = await acc.editProfile(store, boss, 'rani@heymale.id', {
    nama: 'Rani Traffic', peran: 'Traffic', sisi: 'Menswear', divisi: '', jabatan: '', brands: [], phone: '0812 3456-7890', kapasitas: '',
  });
  assert.equal(ed.ok, true, ed.message);
  db = await loadDb(store);
  p = db.master.people.find((x) => x.name === 'Rani Traffic')!;
  assert.deepEqual([p.roles, p.grup, p.phone], [['traffic'], 'Menswear', '6281234567890']);
  const { trafficsFor } = await import('../../lib/master');
  assert.deepEqual(trafficsFor(db.master, 'Menswear').map((x) => x.name), ['Evi', 'Rani Traffic']);

  // Jadi PIC brand: pindah ke Master_PIC, baris Master_Tim dinonaktifkan
  await acc.editProfile(store, boss, 'rani@heymale.id', {
    nama: 'Rani Traffic', peran: 'PIC brand', sisi: 'Menswear', divisi: '', jabatan: '', brands: ['Heymale', 'Zoma'], phone: '', kapasitas: '',
  });
  db = await loadDb(store);
  p = db.master.people.find((x) => x.name === 'Rani Traffic')!;
  assert.deepEqual([p.roles.includes('pic'), p.roles.includes('traffic'), p.brands], [true, false, ['Heymale', 'Zoma']]);
  const logs = (await store.readAll(['Log_Admin'])).Log_Admin;
  assert.ok(logs.some((l) => l.Aksi === 'Ubah peran kerja' && l.Dari.startsWith('Traffic') && l.Ke.startsWith('PIC brand')));

  assert.match((await acc.editProfile(store, boss, 'rani@heymale.id', { ...p && { nama: 'Rani Traffic', peran: 'Lead', sisi: 'Semua', divisi: '', jabatan: '', brands: [], phone: '', kapasitas: '' } })).message, /Pilih divisi/);
});

test('ganti email: unik, akun & master ikut, email lama tidak bisa login', async () => {
  const store = testStore();
  await acc.createAccount(store, boss, mk('daniel@preppstudio.com', 'Daniel Pranata', 'User', 'Daniel123', false, { peran: 'Head of Creative Production', divisi: '' }));
  await acc.createAccount(store, boss, mk('lain@heymale.id', 'Lain', 'User', 'Lain12345', false));
  assert.match((await acc.changeEmail(store, boss, 'daniel@preppstudio.com', 'LAIN@heymale.id')).message, /sudah terdaftar/);
  assert.match((await acc.changeEmail(store, boss, 'daniel@preppstudio.com', 'bukan')).message, /tidak valid/);
  const r = await acc.changeEmail(store, boss, 'daniel@preppstudio.com', 'daniel.pranata@worldwhiteenterprise.com');
  assert.equal(r.ok, true, r.message);
  assert.equal((await acc.authenticate(store, 'daniel@preppstudio.com', 'Daniel123')).ok, false);
  assert.equal((await acc.authenticate(store, 'daniel.pranata@worldwhiteenterprise.com', 'Daniel123')).ok, true);
  const db = await loadDb(store);
  assert.equal(db.master.people.find((x) => x.name === 'Daniel Pranata')!.email, 'daniel.pranata@worldwhiteenterprise.com');
  const mails = (await store.readAll(['Log_Email'])).Log_Email;
  assert.deepEqual(mails.filter((m) => m.Jenis.startsWith('Ganti email')).map((m) => m.Ke).sort(), ['daniel.pranata@worldwhiteenterprise.com', 'daniel@preppstudio.com']);
});
