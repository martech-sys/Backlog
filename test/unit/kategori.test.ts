import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { categoryDefs } from '../../lib/categories';
import { setClock } from '../../lib/clock';
import { loadDb } from '../../lib/db';
import { saveKategori, type KategoriInput } from '../../lib/kategoriAdmin';
import * as svc from '../../lib/service';
import { at, requestInput, testStore, userOf } from './helpers';

afterEach(() => setClock(null));

const admin = { email: 'admin@x.id', name: 'Admin', roles: ['admin' as const], grup: 'Semua' };

const base = (over: Partial<KategoriInput> = {}): KategoriInput => ({
  originalCode: '',
  name: 'Banner marketplace',
  code: 'bm',
  divisi: 'Desain',
  leadMenswear: '',
  leadWomenswear: '',
  modeAssign: 'Otomatis beban',
  assigneeDefault: '',
  leadTimeMin: '3',
  bufferReview: '1',
  subJenis: 'Shopee, Tokopedia, Shopee',
  filterPeran: '',
  fields: [
    { label: 'Platform', type: 'select', required: true, options: 'Shopee, Tokopedia, TikTok Shop' },
    { label: 'Jumlah banner', type: 'number', required: true },
    { label: 'Catatan ukuran', type: 'textarea' },
  ],
  aktif: true,
  ...over,
});

test('kelola kategori: validasi, tambah dari web, langsung bisa dipakai request & routing', async () => {
  const store = testStore();
  const brama = await userOf(store, 'Brama');
  const evi = await userOf(store, 'Evi');

  assert.equal((await saveKategori(store, brama, base())).ok, false, 'PIC bukan admin');
  assert.match((await saveKategori(store, admin, base({ name: 'Fotoshoot' }))).message, /sudah ada/);
  assert.match((await saveKategori(store, admin, base({ code: 'DG' }))).message, /Kode DG sudah dipakai/);
  assert.match((await saveKategori(store, admin, base({ code: 'TOOLONG' }))).message, /1–4 huruf/);
  assert.match((await saveKategori(store, admin, base({ divisi: '' }))).message, /Pilih divisi/);
  assert.match((await saveKategori(store, admin, base({ subJenis: ' , ' }))).message, /sub-jenis/);
  assert.match((await saveKategori(store, admin, base({ fields: [{ label: 'X', type: 'select', options: 'satu' }] }))).message, /minimal 2 pilihan/);
  assert.match((await saveKategori(store, admin, base({ modeAssign: 'Default', assigneeDefault: '' }))).message, /assignee default/);

  const ok = await saveKategori(store, admin, base());
  assert.equal(ok.ok, true, ok.message);
  let db = await loadDb(store);
  const def = categoryDefs(db.master).find((c) => c.name === 'Banner marketplace')!;
  assert.deepEqual(def.subTypes, ['Shopee', 'Tokopedia']);
  assert.deepEqual(
    def.fields.map((f) => [f.key, f.type, !!f.required]),
    [
      ['platform', 'select', true],
      ['jumlah_banner', 'number', true],
      ['catatan_ukuran', 'textarea', false],
    ],
  );
  assert.equal(db.master.kategori.find((k) => k.kategori === 'Banner marketplace')!.code, 'BM');

  at('2026-10-27T02:00:00Z');
  const input = (details: Record<string, string>) =>
    requestInput({ kategori: ['Banner marketplace'], subJenis: { 'Banner marketplace': ['Shopee'] }, details: { 'Banner marketplace': details }, dueDate: '2026-11-13' });
  const bad = await svc.submitRequest(store, brama, input({ platform: 'Shopee' }));
  assert.ok(bad.errors?.['detail:Banner marketplace:jumlah_banner'], 'kolom wajib dari web divalidasi');
  const sub = await svc.submitRequest(store, brama, input({ platform: 'Shopee', jumlah_banner: '5', catatan_ukuran: '1200x628; 1080x1080' }));
  assert.equal(sub.ok, true, `${sub.message} ${JSON.stringify(sub.errors)}`);
  assert.equal((await svc.cekBrief(store, evi, { requestId: sub.id!, decision: 'Lengkap', note: '' })).ok, true);
  db = await loadDb(store);
  const r = db.requests.find((x) => x['Request ID'] === sub.id)!;
  assert.equal(r['Detail Kategori'], 'Banner marketplace — Platform: Shopee; Jumlah banner: 5; Catatan ukuran: 1200x628; 1080x1080');
  const t = db.tasks.find((x) => x['Request ID'] === sub.id)!;
  assert.deepEqual([t['Task ID'], t.Divisi, t.Lead, t['Sub-jenis']], [`${sub.id}-BM`, 'Desain', 'Aulia Pramudya', 'Shopee']);
  assert.deepEqual(svc.parseDetailLine(r['Detail Kategori'], 'Banner marketplace', categoryDefs(db.master)), {
    platform: 'Shopee',
    jumlah_banner: '5',
    catatan_ukuran: '1200x628; 1080x1080',
  });
  const logs = (await store.readAll(['Log_Admin'])).Log_Admin;
  assert.ok(logs.some((l) => l.Aksi === 'Tambah kategori' && l.Target === 'Banner marketplace (BM)'));
});

test('kelola kategori: ubah aturan bawaan & nonaktifkan (hilang dari form, riwayat aman)', async () => {
  const store = testStore();
  // Ubah Videografis: lead time 5 → 4, sub-jenis tambah "TikTok"
  const vd = (await loadDb(store)).master.kategori.find((k) => k.code === 'VD')!;
  const edit = await saveKategori(store, admin, {
    ...base(),
    originalCode: 'VD',
    name: 'diabaikan',
    code: 'XX',
    divisi: vd.divisi,
    leadMenswear: vd.leadMenswear,
    leadWomenswear: vd.leadWomenswear,
    modeAssign: vd.modeAssign,
    leadTimeMin: '4',
    bufferReview: '2',
    subJenis: 'Reels, Story, Katalog web, TikTok',
    fields: [],
  });
  assert.equal(edit.ok, true, edit.message);
  let db = await loadDb(store);
  const vd2 = db.master.kategori.find((k) => k.code === 'VD')!;
  assert.deepEqual([vd2.kategori, vd2.leadTimeMin, vd2.subJenis.includes('TikTok'), vd2.fields], ['Videografis', 4, true, null], 'nama & kolom bawaan tidak berubah');
  assert.ok(categoryDefs(db.master).find((c) => c.name === 'Videografis')!.fields.length > 0);

  // Sub-jenis Fotoshoot berlaku untuk dua barisnya (Foto & Styling)
  const ft = db.master.kategori.find((k) => k.code === 'FT')!;
  await saveKategori(store, admin, { ...base(), originalCode: 'FT', divisi: ft.divisi, modeAssign: ft.modeAssign, leadTimeMin: '7', bufferReview: '2', subJenis: 'Katalog, Lookbook', fields: [] });
  db = await loadDb(store);
  assert.deepEqual(db.master.kategori.filter((k) => k.kategori === 'Fotoshoot').map((k) => k.subJenis.join(',')), ['Katalog,Lookbook', 'Katalog,Lookbook']);

  // Nonaktifkan Moodboard
  const mb = db.master.kategori.find((k) => k.code === 'MB')!;
  await saveKategori(store, admin, { ...base(), originalCode: 'MB', divisi: mb.divisi, modeAssign: mb.modeAssign, leadTimeMin: '2', bufferReview: '1', subJenis: 'Visual direction', fields: [], aktif: false });
  db = await loadDb(store);
  assert.equal(categoryDefs(db.master).some((c) => c.name === 'Moodboard'), false, 'tidak muncul di form');
  assert.equal(categoryDefs(db.master, { includeInactive: true }).some((c) => c.name === 'Moodboard'), true, 'tetap ada untuk filter/riwayat');
  const brama = await userOf(store, 'Brama');
  at('2026-10-27T02:00:00Z');
  const sub = await svc.submitRequest(store, brama, requestInput({ kategori: ['Moodboard'], subJenis: { Moodboard: ['Visual direction'] }, details: { Moodboard: {} }, dueDate: '2026-11-13' }));
  assert.match(sub.errors?.kategori || '', /tidak dikenal/);
  assert.match((await saveKategori(store, admin, { ...base(), originalCode: 'CU', modeAssign: 'Lead pilih', aktif: false, fields: [] })).message, /tidak bisa dinonaktifkan/);
});
