import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { getStore } from '@/lib/store';
import { extractIncoming, handleIncoming, verifySignature } from '@/lib/webhook';

export const dynamic = 'force-dynamic';

/**
 * Lolos bila salah satu benar:
 *  - query ?key= / header X-Webhook-Key sama dengan WEBHOOK_KEY, atau
 *  - header X-Gateway-Signature (Lixus) cocok dengan HMAC-SHA256 body memakai WA_WEBHOOK_SECRET
 *    (atau API key WA_TOKEN bila secret tidak diisi).
 */
function authorized(req: NextRequest, rawBody: string): boolean {
  const key = req.nextUrl.searchParams.get('key') || req.headers.get('x-webhook-key') || '';
  if (env.webhookKey && key === env.webhookKey) return true;
  return verifySignature(rawBody, req.headers.get('x-gateway-signature'), [env.waWebhookSecret, env.waToken]);
}

/** Gateway WA (Lixus / Fonnte / Wablas) mengirim pesan masuk ke sini. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!authorized(req, raw)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let payload: Record<string, unknown> = {};
  try {
    const type = req.headers.get('content-type') || '';
    payload = type.includes('application/x-www-form-urlencoded')
      ? Object.fromEntries(new URLSearchParams(raw))
      : (JSON.parse(raw || '{}') as Record<string, unknown>);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 });
  }

  const incoming = extractIncoming(payload);
  if (incoming.ignore) return NextResponse.json({ ok: true, handled: false, ignored: incoming.ignore });
  if (!incoming.message || !(incoming.sender || incoming.replyTo)) return NextResponse.json({ ok: true, handled: false });

  const result = await handleIncoming(await getStore(), incoming.sender, incoming.message, incoming.replyTo);
  return NextResponse.json({ ok: true, ...result });
}

/** Cek cepat dari browser/gateway: ?key=WEBHOOK_KEY → {"ok":true}. */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') || '';
  return NextResponse.json({ ok: !!env.webhookKey && key === env.webhookKey });
}
