import { getToken } from 'next-auth/jwt';
import { NextResponse, type NextRequest } from 'next/server';

/** Semua halaman wajib login, kecuali halaman login, endpoint auth, webhook WA, dan cron. */
export async function proxy(req: NextRequest) {
  const demo = /^(1|true|yes)$/i.test(process.env.DEMO_MODE || '');
  const loggedIn = demo
    ? !!req.cookies.get('demo_email')?.value
    : !!(await getToken({ req, secret: process.env.NEXTAUTH_SECRET }));
  if (loggedIn) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  const target = req.nextUrl.pathname + req.nextUrl.search;
  if (target !== '/') url.searchParams.set('next', target);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!login|api/auth|api/wa|api/cron|api/health|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)'],
};
