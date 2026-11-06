import { readDriveImage } from '@/lib/drive';
import { getCurrentUser } from '@/lib/session';

export const runtime = 'nodejs';

/** Tampilkan gambar lampiran dari Google Drive tim. Hanya untuk user yang login. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response('Silakan login', { status: 401 });
  const r = await readDriveImage((await params).id);
  if (!r.ok) return new Response(r.status === 404 ? 'Tidak ditemukan' : 'Gagal mengambil gambar dari Drive', { status: r.status });
  return new Response(r.body, { headers: { 'Content-Type': r.type, 'Cache-Control': 'private, max-age=86400' } });
}
