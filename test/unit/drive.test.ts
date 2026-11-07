import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { readDriveImage, setDriveTokenForTests, uploadToDrive } from '../../lib/drive';
import { driveFolderId, env } from '../../lib/env';
import { previewUrl, saveImage } from '../../lib/upload';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  setDriveTokenForTests(null);
});

const FOLDER = '1FolderAbcDEFghiJKLmnop';
function configure() {
  Object.assign(env, { driveFolderId: FOLDER, serviceAccountEmail: 'tracker@proj.iam.gserviceaccount.com', serviceAccountKey: 'kunci-palsu' });
  setDriveTokenForTests(async () => 'tok');
}

/** fetch palsu untuk Drive API. */
function fakeGoogle(handler: (url: string, init: RequestInit) => Response) {
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) =>
    handler(String(input instanceof Request ? input.url : input), init)) as typeof fetch;
}

test('ID folder Drive bisa ditempel sebagai ID atau URL', () => {
  assert.equal(driveFolderId('https://drive.google.com/drive/folders/1FolderAbcDEFghiJKLmnop?usp=sharing'), FOLDER);
  assert.equal(driveFolderId(` ${FOLDER} `), FOLDER);
  assert.equal(driveFolderId('bukan id'), '');
});

test('upload lampiran ke folder Drive tim, ditampilkan lewat /api/drive', async () => {
  configure();
  let sent: { url: string; body: string; auth: string } | null = null;
  fakeGoogle((url, init) => {
    sent = { url, body: Buffer.from(init.body as Buffer).toString('latin1'), auth: String((init.headers as Record<string, string>).Authorization) };
    return Response.json({ id: 'FileId1234567890' });
  });
  const file = new File([new Uint8Array([137, 80, 78, 71])], 'a.png', { type: 'image/png' });
  const r = await saveImage(file, 'CR-2611-001-DG');
  assert.deepEqual(r, { ok: true, url: '/api/drive/FileId1234567890' });
  assert.match(sent!.url, /upload\/drive\/v3\/files\?uploadType=multipart&supportsAllDrives=true/);
  assert.equal(sent!.auth, 'Bearer tok');
  assert.match(sent!.body, new RegExp(`"parents":\\["${FOLDER}"\\]`));
  assert.match(sent!.body, /"name":"CR-2611-001-DG_\d{4}-\d{2}-\d{2}_[0-9a-f]{8}\.png"/);
  assert.equal(previewUrl(r.ok ? r.url : ''), '/api/drive/FileId1234567890');

  // Folder di My Drive (bukan Shared Drive) → pesan yang jelas
  fakeGoogle(() => new Response(JSON.stringify({ error: { reason: 'storageQuotaExceeded' } }), { status: 403 }));
  const bad = await uploadToDrive(file, 'x');
  assert.equal(bad.ok, false);
  assert.match(!bad.ok ? bad.message : '', /Shared Drive/);
});

test('/api/drive hanya melayani gambar di folder lampiran', async () => {
  configure();
  let parents = [FOLDER];
  let mime = 'image/jpeg';
  fakeGoogle((url) => {
    if (url.includes('fields=mimeType')) return Response.json({ mimeType: mime, parents });
    return new Response(new Uint8Array([1, 2, 3]));
  });
  const ok = await readDriveImage('FileId1234567890');
  assert.equal(ok.ok, true);
  parents = ['folderLainABCDEFGHIJ'];
  assert.deepEqual(await readDriveImage('FileId1234567890'), { ok: false, status: 404 });
  parents = [FOLDER];
  mime = 'application/vnd.google-apps.spreadsheet';
  assert.deepEqual(await readDriveImage('FileId1234567890'), { ok: false, status: 404 });
  assert.deepEqual(await readDriveImage('../etc'), { ok: false, status: 404 });
});
