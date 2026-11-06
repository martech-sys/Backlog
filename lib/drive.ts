/**
 * Lampiran gambar di Google Drive tim (folder di Shared Drive), memakai service account yang sama
 * dengan Google Sheets. Gambar tidak dibuat publik: aplikasi menampilkannya lewat /api/drive/<id>
 * yang hanya bisa dibuka user yang sudah login.
 */
import { JWT } from 'google-auth-library';
import { randomBytes } from 'node:crypto';
import { env } from './env';

let jwt: JWT | null = null;
function auth(): JWT {
  jwt ||= new JWT({
    email: env.serviceAccountEmail,
    key: env.serviceAccountKey,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return jwt;
}

let tokenOverride: (() => Promise<string>) | null = null;
/** Khusus pengujian: ganti sumber token Google. */
export function setDriveTokenForTests(fn: (() => Promise<string>) | null) {
  tokenOverride = fn;
}

async function token(): Promise<string> {
  if (tokenOverride) return tokenOverride();
  const { token: t } = await auth().getAccessToken();
  if (!t) throw new Error('Token Google tidak didapat');
  return t;
}

export function driveConfigured(): boolean {
  return !!(env.driveFolderId && env.serviceAccountEmail && env.serviceAccountKey);
}

/** Pesan yang bisa dipahami untuk error Drive yang paling umum. */
function explain(status: number, raw: string): string {
  if (/storageQuotaExceeded|do not have storage quota/i.test(raw))
    return 'Folder Drive harus berada di Shared Drive (Drive bersama), bukan My Drive. Lihat README bagian upload gambar.';
  if (status === 404) return 'Folder Drive tidak ditemukan atau belum dibagikan ke email service account.';
  if (status === 403) return 'Service account belum punya akses edit ke folder Drive (jadikan Content manager).';
  return `Drive HTTP ${status}`;
}

/** Upload satu gambar ke folder lampiran. Mengembalikan ID file Drive. */
export async function uploadToDrive(file: File, prefix: string): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  try {
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const name = `${prefix || 'lampiran'}_${new Date().toISOString().slice(0, 10)}_${randomBytes(4).toString('hex')}.${ext}`;
    const boundary = `ct${randomBytes(12).toString('hex')}`;
    const meta = JSON.stringify({ name, parents: [env.driveFolderId], mimeType: file.type });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`),
      Buffer.from(await file.arrayBuffer()),
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });
    const raw = await res.text();
    if (!res.ok) return { ok: false, message: `Upload ke Drive gagal: ${explain(res.status, raw)}` };
    const id = (JSON.parse(raw) as { id?: string }).id;
    return id ? { ok: true, id } : { ok: false, message: 'Upload ke Drive gagal: ID file tidak dikembalikan.' };
  } catch (e) {
    return { ok: false, message: `Upload ke Drive gagal: ${(e as Error).message}` };
  }
}

/**
 * Ambil gambar lampiran untuk ditampilkan. Hanya file gambar yang berada di folder lampiran yang
 * dilayani, agar endpoint ini tidak bisa dipakai membaca file Drive lain milik service account.
 */
export async function readDriveImage(id: string): Promise<{ ok: true; type: string; body: ReadableStream<Uint8Array> } | { ok: false; status: number }> {
  if (!/^[\w-]{10,}$/.test(id) || !driveConfigured()) return { ok: false, status: 404 };
  const t = await token();
  const base = `https://www.googleapis.com/drive/v3/files/${id}`;
  const meta = await fetch(`${base}?fields=mimeType,parents&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${t}` },
    cache: 'no-store',
  });
  if (!meta.ok) return { ok: false, status: meta.status === 404 ? 404 : 502 };
  const m = (await meta.json()) as { mimeType?: string; parents?: string[] };
  if (!m.mimeType?.startsWith('image/') || !m.parents?.includes(env.driveFolderId)) return { ok: false, status: 404 };
  const res = await fetch(`${base}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' });
  if (!res.ok || !res.body) return { ok: false, status: 502 };
  return { ok: true, type: m.mimeType, body: res.body };
}
