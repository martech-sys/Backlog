/** Variabel lingkungan (diatur di Vercel → Project → Settings → Environment Variables). */

const bool = (v: string | undefined) => /^(1|true|yes)$/i.test(String(v || '').trim());

export const env = {
  /** Mode demo: data di memori + login pilih persona. JANGAN aktifkan di produksi. */
  demoMode: bool(process.env.DEMO_MODE),
  spreadsheetId: process.env.SPREADSHEET_ID || '1THrfMECihSohopWwCfgL91mGP5RsUl8YTBRW01VUbSE',
  serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
  serviceAccountKey: process.env.GOOGLE_PRIVATE_KEY || '',
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
