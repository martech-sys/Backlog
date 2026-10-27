/** Variabel lingkungan (diatur di Vercel → Project → Settings → Environment Variables). */

const bool = (v: string | undefined) => /^(1|true|yes)$/i.test(String(v || '').trim());

/**
 * Kredensial service account Google. Paling mudah: tempel seluruh isi file JSON ke
 * GOOGLE_SERVICE_ACCOUNT_JSON. Alternatif: GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY.
 */
export function serviceAccount(e: Record<string, string | undefined> = process.env): { email: string; key: string } {
  const raw = String(e.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();
  if (raw) {
    try {
      // Terima JSON apa adanya atau versi base64-nya.
      const text = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
      const j = JSON.parse(text) as { client_email?: string; private_key?: string };
      if (j.client_email && j.private_key) return { email: j.client_email, key: normalizeKey(j.private_key) };
    } catch {
      // jatuh ke variabel terpisah
    }
  }
  return { email: String(e.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim(), key: normalizeKey(e.GOOGLE_PRIVATE_KEY || '') };
}

/** Rapikan private key yang ditempel: buang tanda kutip pembungkus dan ubah "\n" menjadi baris baru. */
export function normalizeKey(k: string): string {
  return String(k || '')
    .trim()
    .replace(/^["']|["'],?$/g, '')
    .replace(/\\n/g, '\n')
    .trim();
}

const sa = serviceAccount();

export const env = {
  /** Mode demo: data di memori + login pilih persona. JANGAN aktifkan di produksi. */
  demoMode: bool(process.env.DEMO_MODE),
  spreadsheetId: process.env.SPREADSHEET_ID || '1THrfMECihSohopWwCfgL91mGP5RsUl8YTBRW01VUbSE',
  serviceAccountEmail: sa.email,
  serviceAccountKey: sa.key,
  /** Superadmin cadangan untuk login pertama / darurat (password tidak pernah disimpan di sheet). */
  superadminEmail: process.env.SUPERADMIN_EMAIL || 'dodi.wahyono@worldwhiteenterprise.com',
  superadminPassword: process.env.SUPERADMIN_PASSWORD || '',
  waProvider: (process.env.WA_PROVIDER || 'fonnte').toLowerCase(),
  waToken: process.env.WA_TOKEN || '',
  waApiUrl: process.env.WA_API_URL || '',
  /** Default: dry-run bila token belum diisi. Pesan tetap tercatat di Log_WA. */
  waDryRun: process.env.WA_DRY_RUN ? bool(process.env.WA_DRY_RUN) : !process.env.WA_TOKEN,
  webhookKey: process.env.WEBHOOK_KEY || '',
  cronSecret: process.env.CRON_SECRET || '',
  appUrl: (
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
    'http://localhost:3000'
  ).replace(/\/$/, ''),
};
