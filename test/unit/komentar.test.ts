import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { STATUS } from '../../lib/config';
import { setClock } from '../../lib/clock';
import { loadDb } from '../../lib/db';
import * as svc from '../../lib/service';
import { previewUrl } from '../../lib/upload';
import { at, requestInput, testStore, userOf } from './helpers';

afterEach(() => setClock(null));

test('komentar, deskripsi, preview draft, dan revisi brand lewat komentar', async () => {
  const store = testStore();
  const brama = await userOf(store, 'Brama');
  const evi = await userOf(store, 'Evi');
  const aulia = await userOf(store, 'Aulia Pramudya');
  const desA = await userOf(store, 'Desainer A');
  const vid = await userOf(store, 'Videografer A');

  at('2026-10-27T02:00:00Z');
  await svc.submitRequest(store, brama, requestInput({ dueDate: '2026-11-13' }));
  await svc.cekBrief(store, evi, { requestId: 'CR-2610-001', decision: 'Lengkap', note: '' });
  let db = await loadDb(store);
  const t = db.tasks[0];
  assert.equal(t['Task ID'], 'CR-2610-001-DG');
  assert.equal(t.Assignee, 'Desainer A');
  const id = t['Task ID'];

  // Deskripsi: assignee boleh, orang lain tidak
  assert.equal((await svc.updateDescription(store, desA, id, 'Pakai template Payday')).ok, true);
  assert.equal((await svc.updateDescription(store, vid, id, 'x')).ok, false);

  // Komentar: orang yang tidak terlibat ditolak; assignee boleh, WA ke pemegang bola
  assert.equal((await svc.addComment(store, vid, id, { jenis: 'Catatan', isi: 'halo', lampiran: [] })).ok, false);
  assert.equal((await svc.addComment(store, desA, id, { jenis: 'Catatan', isi: '', lampiran: [] })).ok, false);
  const c1 = await svc.addComment(store, brama, id, { jenis: 'Catatan', isi: 'Logo jangan terlalu kecil', lampiran: ['https://x.public.blob.vercel-storage.com/a.jpg', 'javascript:alert(1)'] });
  assert.equal(c1.ok, true, c1.message);
  assert.match(c1.message, /Desainer A diberi tahu/);
  assert.equal((await svc.addComment(store, desA, id, { jenis: 'QC lead', isi: 'x', lampiran: [] })).ok, false, 'label QC hanya lead');

  // Draft dengan preview → QC gagal → draft v2 → lolos → Revisi brand lewat komentar
  await svc.submitDraft(store, desA, id, 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz12345/view', ['https://x.public.blob.vercel-storage.com/p1.jpg'], 'v1 siap');
  await svc.qcDecision(store, aulia, id, false, 'Font kurang tebal');
  await svc.submitDraft(store, desA, id, 'https://drive.google.com/file/d/2AbCdEfGhIjKlMnOpQrStUvWxYz12345/view');
  await svc.qcDecision(store, aulia, id, true, '');
  assert.match((await svc.addComment(store, desA, id, { jenis: 'Revisi brand', isi: 'x', lampiran: [] })).message, /PIC brand/);
  const forV1 = await svc.addComment(store, aulia, id, { jenis: 'QC lead', isi: 'Catatan tambahan untuk v1', lampiran: [], versi: '1' });
  assert.equal(forV1.ok, true, forV1.message);
  const rev = await svc.addComment(store, brama, id, { jenis: 'Revisi brand', isi: 'Background lebih terang', lampiran: [] });
  assert.equal(rev.ok, true, rev.message);

  db = await loadDb(store, { withWaLog: true });
  const task = db.tasks.find((x) => x['Task ID'] === id)!;
  assert.deepEqual([task.Status, task['Ronde Revisi'], task.Deskripsi], [STATUS.REVISI_BRAND, '1', 'Pakai template Payday']);
  const k = db.komentar.filter((x) => x['Task ID'] === id);
  assert.deepEqual(
    k.map((x) => [x.Jenis, x.Versi, x.Peran]),
    [
      ['Catatan', '0', 'PIC brand'],
      ['Draft', '1', 'Assignee'],
      ['QC lead', '1', 'Lead'],
      ['Draft', '2', 'Assignee'],
      ['QC lead', '2', 'Lead'],
      ['QC lead', '1', 'Lead'],
      ['Revisi brand', '2', 'PIC brand'],
    ],
  );
  assert.equal(k[0].Lampiran, 'https://x.public.blob.vercel-storage.com/a.jpg', 'URL non-http dibuang');
  assert.match(k[6].Isi, /^R1: Background lebih terang/);
  assert.ok(db.waLog.some((w) => w.Jenis === 'Komentar baru' && w.Nama === 'Desainer A'));
});

test('previewUrl: Drive → thumbnail, gambar langsung, selain itu null', () => {
  assert.equal(previewUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz12345/view?usp=sharing'), 'https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrStUvWxYz12345&sz=w640');
  assert.equal(previewUrl('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz12345'), 'https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrStUvWxYz12345&sz=w640');
  assert.equal(previewUrl('https://cdn.example.com/a.PNG'), 'https://cdn.example.com/a.PNG');
  assert.equal(previewUrl('https://www.figma.com/file/abc'), null);
});

test('kategori custom: masuk ke Traffic, lalu Traffic atur divisi & lead atau ubah kategori', async () => {
  const store = testStore();
  const brama = await userOf(store, 'Brama');
  const evi = await userOf(store, 'Evi');
  at('2026-10-27T02:00:00Z');
  const sub = await svc.submitRequest(
    store,
    brama,
    requestInput({
      kategori: ['Lainnya (custom)', 'Photo editing'],
      subJenis: { 'Lainnya (custom)': ['Custom'], 'Photo editing': ['Retouch produk'] },
      details: {
        'Lainnya (custom)': { kebutuhan: 'Banner marketplace Shopee 5 ukuran', contoh: '', output: '5 file' },
        'Photo editing': { folderMentah: 'https://drive.google.com/x', jumlahFoto: '20', gaya: '', ukuran: '1:1', format: 'JPG' },
      },
      dueDate: '2026-11-13',
    }),
  );
  assert.equal(sub.ok, true, sub.message);
  const ok = await svc.cekBrief(store, evi, { requestId: sub.id!, decision: 'Lengkap', note: '' });
  assert.equal(ok.ok, true, ok.message);
  let db = await loadDb(store);
  const pe = db.tasks.find((t) => t.Kategori === 'Photo editing')!;
  const cu = db.tasks.find((t) => t.Kategori === 'Lainnya (custom)')!;
  assert.equal(pe['Task ID'], `${sub.id}-PE`);
  assert.equal(pe.Divisi, 'Foto');
  assert.equal(cu['Task ID'], `${sub.id}-CU`);
  assert.deepEqual([cu.Divisi, cu.Lead, cu.Status, cu['Bola di']], ['', '', STATUS.SIAP_ASSIGN, 'Traffic (Evi)']);
  assert.ok(svc.needsCustomSetup(cu));

  assert.equal((await svc.setupCustomTask(store, brama, cu['Task ID'], { kategori: '', divisi: 'Desain', lead: '', deadline: '', jenisCustom: 'x' })).ok, false, 'PIC tidak boleh');
  assert.match((await svc.setupCustomTask(store, evi, cu['Task ID'], { kategori: 'Lainnya (custom)', divisi: 'Desain', lead: '', deadline: '', jenisCustom: '' })).message, /jenis pekerjaan/);
  const set = await svc.setupCustomTask(store, evi, cu['Task ID'], { kategori: 'Lainnya (custom)', divisi: 'Desain', lead: '', deadline: '2026-11-12', jenisCustom: 'Banner marketplace' });
  assert.equal(set.ok, true, set.message);
  db = await loadDb(store, { withWaLog: true });
  const t = db.tasks.find((x) => x['Task ID'] === cu['Task ID'])!;
  assert.deepEqual([t.Divisi, t['Jenis Custom'], t.Deadline, t['Bola di'].startsWith('Lead (')], ['Desain', 'Banner marketplace', '2026-11-12', true]);
  assert.ok(db.waLog.some((w) => w['Ref ID'] === t['Task ID'] && w.Nama === t.Lead));
  assert.equal(svc.needsCustomSetup(t), false);
});

test('PIC baru dari Kelola user (grup Semua + daftar brand) bisa dipakai di request; budget bertitik diterima', async () => {
  const store = testStore();
  const { saveProfile } = await import('../../lib/people');
  await saveProfile(store, {
    email: 'martech@heymale.id',
    by: 'Dodi',
    profile: { nama: 'MArtech', peran: 'PIC brand', sisi: 'Semua', divisi: '', jabatan: '', brands: ['Heymale', 'Heylocal'], phone: '6281200001111', kapasitas: '' },
  });
  const evi = await userOf(store, 'Evi');
  at('2026-10-27T02:00:00Z');
  const ok = await svc.submitRequest(store, evi, requestInput({ brand: 'Heymale', picName: 'MArtech', budget: '2.000.000', dueDate: '2026-11-13' }));
  assert.equal(ok.ok, true, ok.message + JSON.stringify(ok.errors));
  const db = await loadDb(store);
  const r = db.requests.find((x) => x['Request ID'] === ok.id)!;
  assert.deepEqual([r['PIC Brand'], String(r.Budget)], ['MArtech', '2000000']);
  const bad = await svc.submitRequest(store, evi, requestInput({ brand: 'Zoma', picName: 'MArtech', dueDate: '2026-11-13' }));
  assert.match(bad.errors?.picName || '', /tidak memegang brand Zoma/);
});
