import { inSimulation } from './clock';
import { env } from './env';

export interface SendResult {
  ok: boolean;
  detail: string;
}

/**
 * Kirim pesan WhatsApp lewat gateway.
 *  - lixus  : POST <WA_API_URL>/api/messages/send  (header X-API-Key: <WA_TOKEN>, body {to, text})
 *  - fonnte : POST https://api.fonnte.com/send     (header Authorization: <token>)
 *  - wablas : POST <WA_API_URL>                    (header Authorization: <token>)
 * `to` boleh nomor (628…) atau JID lengkap (…@s.whatsapp.net / …@lid) untuk membalas pengirim.
 * Saat dry-run, pesan tidak dikirim (tetap dicatat di Log_WA oleh pemanggil).
 */
export async function sendWa(to: string, message: string): Promise<SendResult> {
  if (env.waDryRun || env.waProvider === 'none' || inSimulation()) {
    return { ok: true, detail: to ? 'DRY_RUN' : 'DRY_RUN · nomor WA belum diisi' };
  }
  if (!to) return { ok: false, detail: 'Nomor WA belum diisi di master data' };

  try {
    if (env.waProvider === 'lixus') return await sendLixus(to, message);

    let res: Response;
    if (env.waProvider === 'wablas') {
      if (!env.waApiUrl) return { ok: false, detail: 'WA_API_URL belum diatur' };
      res = await fetch(env.waApiUrl, {
        method: 'POST',
        headers: { Authorization: env.waToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: to, message }),
        cache: 'no-store',
      });
    } else {
      const body = new URLSearchParams({ target: to, message, countryCode: '62' });
      res = await fetch(env.waApiUrl || 'https://api.fonnte.com/send', {
        method: 'POST',
        headers: { Authorization: env.waToken },
        body,
        cache: 'no-store',
      });
    }
    const text = (await res.text()).slice(0, 200);
    // Fonnte mengembalikan HTTP 200 dengan {"status":false,...} saat gagal.
    const failed = !res.ok || /"status"\s*:\s*false/.test(text);
    return { ok: !failed, detail: `${res.status} ${text}` };
  } catch (e) {
    return { ok: false, detail: `ERROR ${(e as Error).message}` };
  }
}

const LIXUS_ERRORS: Record<number, string> = {
  400: 'Data pesan tidak lengkap (400)',
  401: 'API key Lixus salah atau belum diisi (401)',
  503: 'Sesi WhatsApp di gateway Lixus tidak aktif (503)',
};

async function sendLixus(to: string, text: string): Promise<SendResult> {
  if (!env.waApiUrl) return { ok: false, detail: 'WA_API_URL (alamat gateway Lixus) belum diatur' };
  if (!env.waToken) return { ok: false, detail: 'WA_TOKEN (API key Lixus) belum diatur' };
  const res = await fetch(`${env.waApiUrl}/api/messages/send`, {
    method: 'POST',
    headers: { 'X-API-Key': env.waToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, text }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  const raw = await res.text();
  let body: { success?: boolean; messageId?: string; error?: string } = {};
  try {
    body = JSON.parse(raw);
  } catch {
    // respons bukan JSON
  }
  if (res.ok && body.success !== false) return { ok: true, detail: `OK ${body.messageId || ''}`.trim() };
  const reason = LIXUS_ERRORS[res.status] || `HTTP ${res.status}`;
  return { ok: false, detail: `${reason}${body.error ? `: ${body.error}` : raw ? `: ${raw.slice(0, 120)}` : ''}` };
}

export interface GatewayStatus {
  provider: string;
  configured: boolean;
  dryRun: boolean;
  connected: boolean | null;
  phoneNumber: string | null;
  uptime: string | null;
  error?: string;
}

/** Status sesi WA di gateway (khusus Lixus: GET /api/status). */
export async function gatewayStatus(): Promise<GatewayStatus> {
  const base: GatewayStatus = {
    provider: env.waProvider,
    configured: env.waProvider === 'lixus' ? !!(env.waApiUrl && env.waToken) : !!env.waToken,
    dryRun: env.waDryRun,
    connected: null,
    phoneNumber: null,
    uptime: null,
  };
  if (env.waProvider !== 'lixus' || !base.configured) return base;
  try {
    const res = await fetch(`${env.waApiUrl}/api/status`, {
      headers: { 'X-API-Key': env.waToken },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ...base, connected: false, error: LIXUS_ERRORS[res.status] || `HTTP ${res.status}` };
    const j = (await res.json()) as { status?: string; phoneNumber?: string | null; uptime?: string };
    return { ...base, connected: j.status === 'connected', phoneNumber: j.phoneNumber ?? null, uptime: j.uptime ?? null };
  } catch (e) {
    return { ...base, connected: false, error: `Gateway tidak bisa dihubungi: ${(e as Error).message}` };
  }
}
