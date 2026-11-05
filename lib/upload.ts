/**
 * Upload gambar lampiran komentar & preview draft.
 * Produksi: Vercel Blob (env BLOB_READ_WRITE_TOKEN, dibuat otomatis saat Blob store dihubungkan ke project).
 * Mode demo: disimpan di memori server dan dilayani dari /api/upload/<id>.
 */
import { put } from '@vercel/blob';
import { randomBytes } from 'node:crypto';
import { env } from './env';

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const memory = new Map<string, { type: string; data: Buffer }>();

export function uploadConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN || env.demoMode;
}

export async function saveImage(file: File, folder: string): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const ext = TYPES[file.type];
  if (!ext) return { ok: false, message: 'Hanya gambar JPG atau PNG.' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, message: 'Ukuran gambar maksimal 4 MB.' };
  if (file.size === 0) return { ok: false, message: 'File kosong.' };
  const safeFolder = folder.replace(/[^A-Za-z0-9-]/g, '').slice(0, 40) || 'lain';
  const name = `${randomBytes(9).toString('base64url')}.${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const blob = await put(`lampiran/${safeFolder}/${name}`, file, {
        access: 'public',
        contentType: file.type,
        addRandomSuffix: true,
      });
      return { ok: true, url: blob.url };
    } catch (e) {
      return { ok: false, message: `Upload gagal: ${(e as Error).message}` };
    }
  }
  if (env.demoMode) {
    if (memory.size > 300) memory.delete(memory.keys().next().value!);
    memory.set(name, {
      type: file.type,
      data: Buffer.from(await file.arrayBuffer()),
    });
    return { ok: true, url: `/api/upload/${name}` };
  }
  return {
    ok: false,
    message:
      'Upload gambar belum aktif: hubungkan Vercel Blob ke project (Storage → Blob) agar BLOB_READ_WRITE_TOKEN terisi. Sementara, tempel link Google Drive.',
  };
}

export function readMemoryImage(name: string) {
  return memory.get(name);
}

/** URL gambar untuk ditampilkan: link Google Drive diubah ke URL thumbnail; selain gambar → null. */
export function previewUrl(link: string): string | null {
  const u = String(link || '').trim();
  if (!u) return null;
  if (u.startsWith('/api/upload/')) return u;
  const drive =
    u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{20,})/) ||
    u.match(/docs\.google\.com\/\w+\/d\/([\w-]{20,})/);
  if (drive) return `https://drive.google.com/thumbnail?id=${drive[1]}&sz=w640`;
  if (/^https:\/\/\S+\.(jpe?g|png|webp|gif)(\?\S*)?$/i.test(u) || /\.blob\.vercel-storage\.com\//.test(u)) return u;
  return null;
}
