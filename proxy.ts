import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from './lib/token';

/**
 * Semua halaman wajib login, kecuali halaman login, webhook WA, cron, dan health.
 * User yang wajib ganti password diarahkan ke /akun dulu.
 */
export async function proxy(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const path = req.nextUrl.pathname;

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    const target = path + req.nextUrl.search;
    if (target !== '/') url.searchParams.set('next', target);
    return NextResponse.redirect(url);
  }
  if (session.m === 1 && path !== '/akun') {
    const url = req.nextUrl.clone();
    url.pathname = '/akun';
    url.search = '?wajib=1';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!login|api/wa|api/cron|api/health|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)'],
};
