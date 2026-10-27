import { inSimulation } from './clock';
import { env } from './env';

export interface SendResult {
  ok: boolean;
  detail: string;
}

/**
 * Kirim pesan WhatsApp lewat gateway.
 *  - fonnte : POST https://api.fonnte.com/send  (header Authorization: <token>)
 *  - wablas : POST <WA_API_URL>                 (header Authorization: <token>)
 * Saat dry-run, pesan tidak dikirim (tetap dicatat di Log_WA oleh pemanggil).
 */
export async function sendWa(phone: string, message: string): Promise<SendResult> {
  if (env.waDryRun || env.waProvider === 'none' || inSimulation()) {
    return { ok: true, detail: phone ? 'DRY_RUN' : 'DRY_RUN · nomor WA belum diisi' };
  }
  if (!phone) return { ok: false, detail: 'Nomor WA belum diisi di master data' };

  try {
    let res: Response;
    if (env.waProvider === 'wablas') {
      if (!env.waApiUrl) return { ok: false, detail: 'WA_API_URL belum diatur' };
      res = await fetch(env.waApiUrl, {
        method: 'POST',
        headers: { Authorization: env.waToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message }),
        cache: 'no-store',
      });
    } else {
      const body = new URLSearchParams({ target: phone, message, countryCode: '62' });
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
