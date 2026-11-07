import { NextResponse } from 'next/server';
import { envSuperadmin } from '@/lib/accounts';
import { driveConfigured } from '@/lib/drive';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    mode: env.demoMode ? 'demo' : 'sheets',
    sheetsConfigured: !!(env.serviceAccountEmail && env.serviceAccountKey),
    authSecretConfigured: !!process.env.AUTH_SECRET || env.demoMode,
    superadminBootstrap: !!envSuperadmin(),
    wa: env.waDryRun ? 'dry-run' : env.waProvider,
    webhookConfigured: !!env.webhookKey,
    cronConfigured: !!env.cronSecret,
    uploads: driveConfigured() ? 'drive' : process.env.BLOB_READ_WRITE_TOKEN ? 'blob' : env.demoMode ? 'memory' : 'off',
  });
}
