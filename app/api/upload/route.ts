import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { saveImage } from '@/lib/upload';

export const runtime = 'nodejs';

/** Upload satu gambar (multipart field "file"). Hanya untuk user yang login. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, message: 'Silakan login lagi.' }, { status: 401 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, message: 'Data upload tidak terbaca.' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ ok: false, message: 'Tidak ada file.' }, { status: 400 });
  const r = await saveImage(file, String(form.get('folder') || ''));
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
