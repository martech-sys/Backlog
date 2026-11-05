import { readMemoryImage } from '@/lib/upload';

/** Mode demo: gambar yang diupload disimpan di memori server. */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const img = readMemoryImage((await params).name);
  if (!img) return new Response('Tidak ditemukan', { status: 404 });
  return new Response(new Uint8Array(img.data), { headers: { 'Content-Type': img.type, 'Cache-Control': 'private, max-age=3600' } });
}
