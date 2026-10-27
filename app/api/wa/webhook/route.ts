import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { getStore } from '@/lib/store';
import { extractIncoming, handleIncoming } from '@/lib/webhook';

export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  if (!env.webhookKey) return false;
  const key = req.nextUrl.searchParams.get('key') || req.headers.get('x-webhook-key') || '';
  return key === env.webhookKey;
}

/** Gateway WA (Fonnte/Wablas) mengirim pesan masuk ke sini: /api/wa/webhook?key=WEBHOOK_KEY */
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let payload: Record<string, unknown> = {};
  const type = req.headers.get('content-type') || '';
  try {
    if (type.includes('application/json')) payload = await req.json();
    else payload = Object.fromEntries((await req.formData()).entries()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 });
  }

  const { sender, message } = extractIncoming(payload);
  if (!sender || !message) return NextResponse.json({ ok: true, handled: false });
  // Abaikan pesan yang dikirim oleh nomor bot sendiri (beberapa gateway meneruskannya).
  if (payload.fromMe === true || payload.from_me === true) return NextResponse.json({ ok: true, handled: false });

  const result = await handleIncoming(await getStore(), sender, message);
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: NextRequest) {
  return NextResponse.json({ ok: authorized(req) });
}
