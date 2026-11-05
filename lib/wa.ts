import { inSimulation } from './clock';
import { env } from './env';

export interface SendResult {
  ok: boolean;
  /** Terkirim · <id> | DRY_RUN | Gagal: <alasan> | Dilewati: nomor WA kosong */
  detail: string;
  /** Tidak dicoba sama sekali (nomor kosong). */
  skipped?: boolean;
  /** Error sementara (jaringan/5xx/429): layak dicoba ulang. */
  transient?: boolean;
}

export const WA_MAX_TRIES = 3;

/** Mode uji efektif: pengaturan di Config (halaman Pengaturan WA) menang atas env WA_DRY_RUN. */
export function isDryRun(configDryRun: boolean | null | undefined = null): boolean {
  if (env.waProvider === 'none' || inSimulation()) return true;
  return configDryRun ?? env.waDryRun;
}

/** Status ringkas untuk satu baris Log_WA. */
export function waStatus(hasil: string): 'Terkirim' | 'Gagal' | 'Dilewati' | 'DRY_RUN' | 'Masuk' {
  const h = String(hasil || '');
  if (/^DRY_RUN/.test(h)) return 'DRY_RUN';
  if (/^(Dilewati)/i.test(h)) return 'Dilewati';
  if (/^(GAGAL|Gagal|ERROR)/.test(h)) return 'Gagal';
  if (!h) return 'Masuk';
  return 'Terkirim';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Kirim pesan WhatsApp lewat gateway, dengan coba ulang otomatis (maks. 3x) untuk error sementara.
 *  - lixus  : POST <WA_API_URL>/api/messages/send  (header X-API-Key: <WA_TOKEN>, body {to, text})
 *  - fonnte : POST https://api.fonnte.com/send     (header Authorization: <token>)
 *  - wablas : POST <WA_API_URL>                    (header Authorization: <token>)
 * `to` boleh nomor (628…) atau JID lengkap (…@s.whatsapp.net / …@lid) untuk membalas pengirim.
 */
export async function sendWa(to: string, message: string, opts: { dryRun?: boolean; backoffMs?: number } = {}): Promise<SendResult> {
  if (inSimulation()) return { ok: true, detail: 'DRY_RUN' };
  if (!to) return { ok: false, skipped: true, detail: 'Dilewati: nomor WA kosong' };
  if (opts.dryRun ?? isDryRun()) return { ok: true, detail: 'DRY_RUN' };
  let last: SendResult = { ok: false, detail: 'Gagal' };
  for (let attempt = 1; attempt <= WA_MAX_TRIES; attempt++) {
    last = await sendOnce(to, message);
    if (last.ok || !last.transient) break;
    if (attempt < WA_MAX_TRIES) await sleep((opts.backoffMs ?? 800) * attempt);
  }
  if (last.ok) return last;
  const tries = last.transient ? ` (dicoba ${WA_MAX_TRIES}x)` : '';
  return { ok: false, detail: `Gagal: ${last.detail}${tries}`.slice(0, 300) };
}

async function sendOnce(to: string, message: string): Promise<SendResult> {
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
        signal: AbortSignal.timeout(15000),
      });
    } else {
      const body = new URLSearchParams({ target: to, message, countryCode: '62' });
      res = await fetch(env.waApiUrl || 'https://api.fonnte.com/send', {
        method: 'POST',
        headers: { Authorization: env.waToken },
        body,
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });
    }
    const text = (await res.text()).slice(0, 200);
    // Fonnte mengembalikan HTTP 200 dengan {"status":false,...} saat gagal.
    const failed = !res.ok || /"status"\s*:\s*false/.test(text);
    if (!failed) return { ok: true, detail: `Terkirim · ${res.status}` };
    return { ok: false, detail: `${res.status} ${text}`, transient: res.status >= 500 || res.status === 429 };
  } catch (e) {
    return { ok: false, detail: `Gateway tidak bisa dihubungi: ${(e as Error).message}`, transient: true };
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
  if (res.ok && body.success !== false) return { ok: true, detail: `Terkirim · ${body.messageId || res.status}` };
  const reason = LIXUS_ERRORS[res.status] || `HTTP ${res.status}`;
  return {
    ok: false,
    detail: `${reason}${body.error ? `: ${body.error}` : raw ? `: ${raw.slice(0, 120)}` : ''}`,
    // 503 = sesi WA gateway mati: tidak akan pulih dalam hitungan detik.
    transient: (res.status >= 500 && res.status !== 503) || res.status === 429,
  };
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
export async function gatewayStatus(configDryRun: boolean | null = null): Promise<GatewayStatus> {
  const base: GatewayStatus = {
    provider: env.waProvider,
    configured: env.waProvider === 'lixus' ? !!(env.waApiUrl && env.waToken) : !!env.waToken,
    dryRun: isDryRun(configDryRun),
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
