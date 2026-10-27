import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { SheetsStore } from '../../lib/store/sheets';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** SheetsStore dengan token palsu dan fetch tiruan yang merekam request. */
function mockStore(sheet: unknown[][]) {
  const calls: { url: string; method: string; body: any }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: decodeURIComponent(String(url)), method: init.method || 'GET', body: init.body ? JSON.parse(String(init.body)) : null });
    const u = decodeURIComponent(String(url));
    if (u.includes('values:batchGet')) {
      const ranges = new URL(String(url)).searchParams.getAll('ranges');
      const col = (r: string) => {
        const m = /!([A-Z]+):\1$/.exec(r);
        if (!m) return null;
        const idx = m[1].charCodeAt(0) - 65;
        return sheet.map((row) => [row[idx]]);
      };
      return new Response(
        JSON.stringify({ valueRanges: ranges.map((r) => ({ values: r.endsWith('!1:1') ? [sheet[0]] : col(r) || sheet })) }),
      );
    }
    return new Response('{}');
  }) as typeof fetch;
  const store = new SheetsStore('SHEET', 'sa@x.iam.gserviceaccount.com', 'key');
  (store as unknown as { jwt: unknown }).jwt = { getAccessToken: async () => ({ token: 't' }) };
  return { store, calls };
}

test('append memetakan objek ke urutan header di sheet (RAW)', async () => {
  const { store, calls } = mockStore([['Task ID', 'Status', 'Deadline']]);
  await store.append('Task', [{ Deadline: '2026-11-01', 'Task ID': 'CR-1', Asing: 'x' }]);
  const post = calls.find((c) => c.method === 'POST')!;
  assert.match(post.url, /'Task'!A1:append\?valueInputOption=RAW&insertDataOption=INSERT_ROWS/);
  assert.deepEqual(post.body.values, [['CR-1', '', '2026-11-01']]);
});

test('update menulis sel yang tepat berdasarkan kolom kunci', async () => {
  const { store, calls } = mockStore([
    ['Task ID', 'Status', 'Deadline'],
    ['CR-1', 'Dikerjakan', '2026-11-01'],
    ['CR-2', 'QC Lead', '2026-11-02'],
  ]);
  await store.update('Task', 'Task ID', [{ key: 'CR-2', patch: { Status: 'Review Brand', Tidak: 'x' } }]);
  const post = calls.find((c) => c.method === 'POST')!;
  assert.match(post.url, /values:batchUpdate$/);
  assert.deepEqual(post.body, { valueInputOption: 'RAW', data: [{ range: "'Task'!B3", values: [['Review Brand']] }] });
  assert.ok(calls.some((c) => c.url.includes("ranges='Task'!A:A")), 'hanya membaca kolom kunci');
  await assert.rejects(store.update('Task', 'Task ID', [{ key: 'CR-9', patch: { Status: 'x' } }]), /tidak ditemukan/);
});

test('readAll membaca sheet utuh dan normalisasi tanggal', async () => {
  const { store } = mockStore([
    ['Task ID', 'Deadline'],
    ['CR-1', 46325],
  ]);
  const t = await store.readAll(['Task']);
  assert.equal(t.Task[0].Deadline, '2026-10-30');
});

test('cache baca: dua kali baca berturut-turut = satu panggilan API, dibuang setelah tulis', async () => {
  const { store, calls } = mockStore([['Task ID', 'Status'], ['CR-1', 'Baru']]);
  await store.readAll(['Task']);
  await store.readAll(['Task']);
  assert.equal(calls.length, 1);
  await store.append('Task', [{ 'Task ID': 'CR-2' }]);
  await store.readAll(['Task']);
  assert.equal(calls.filter((c) => c.url.includes('batchGet')).length, 2, 'header dari cache, baca ulang setelah tulis');
});

test('deleteWhere menghapus baris cocok dari bawah ke atas dalam satu batch', async () => {
  const { store, calls } = mockStore([
    ['Task ID', 'Status'],
    ['DEMO-1', 'x'],
    ['DEMO-2', 'x'],
    ['CR-1', 'x'],
    ['DEMO-3', 'x'],
  ]);
  const realFetch2 = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if (String(url).includes('fields=sheets.properties')) {
      return new Response(JSON.stringify({ sheets: [{ properties: { sheetId: 7, title: 'Task' } }] }));
    }
    return realFetch2(url, init);
  }) as typeof fetch;
  const n = await store.deleteWhere('Task', 'Task ID', (v) => v.startsWith('DEMO-'));
  assert.equal(n, 3);
  const batch = calls.find((c) => c.url.endsWith(':batchUpdate'))!;
  assert.deepEqual(
    batch.body.requests.map((r: any) => [r.deleteDimension.range.startIndex, r.deleteDimension.range.endIndex]),
    [
      [4, 5],
      [1, 3],
    ],
  );
  assert.equal(batch.body.requests[0].deleteDimension.range.sheetId, 7);
});
