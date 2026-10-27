import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    mode: env.demoMode ? 'demo' : 'sheets',
    sheetsConfigured: !!(env.serviceAccountEmail && env.serviceAccountKey),
    googleLoginConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.NEXTAUTH_SECRET),
    wa: env.waDryRun ? 'dry-run' : env.waProvider,
    webhookConfigured: !!env.webhookKey,
    cronConfigured: !!env.cronSecret,
  });
}
