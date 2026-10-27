import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { runDigest, runReminders, runWeekly } from '@/lib/scheduler';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const JOBS = { reminders: runReminders, digest: runDigest, weekly: runWeekly };

/** Dipanggil Vercel Cron (lihat vercel.json) dengan header Authorization: Bearer CRON_SECRET. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ job: string }> }) {
  const { job } = await ctx.params;
  if (!env.cronSecret || req.headers.get('authorization') !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const fn = JOBS[job as keyof typeof JOBS];
  if (!fn) return NextResponse.json({ ok: false, error: 'unknown job' }, { status: 404 });
  try {
    const result = await fn(await getStore());
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error(`[cron:${job}]`, e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
