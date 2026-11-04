import { redirect } from 'next/navigation';
import { demoLoginAction } from '@/app/actions';
import { APP_NAME } from '@/lib/config';
import { env } from '@/lib/env';
import { getCurrentUser } from '@/lib/session';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Masuk' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith('/') && !sp.next.startsWith('//') ? sp.next : '/';
  if (await getCurrentUser().catch(() => null)) redirect(next);

  const personas = env.demoMode ? (await import('@/lib/demo')).demoPersonas() : [];
  return (
    <div className="login-wrap">
      <div className="mcard login-card" style={{ ['--c' as string]: '#2f6fed', marginTop: 22 }}>
        <div className="tab">{APP_NAME}</div>
        <div className="row" style={{ gap: 12, marginBottom: 6 }}>
          <span className="brand-mark" style={{ width: 40, height: 40, fontSize: 16 }}>
            CR
          </span>
          <div>
            <h1 style={{ fontSize: 20 }}>Creative Request Tracker</h1>
            <p className="muted" style={{ margin: 0 }}>
              Backlog tim Creative · Heymale Group
            </p>
          </div>
        </div>

        <LoginForm next={next} />
        <p className="subtle" style={{ marginTop: 10 }}>
          Belum punya akun atau lupa password? Hubungi Superadmin.
        </p>

        {env.demoMode ? (
          <>
            <div className="flash ok" style={{ marginTop: 12 }}>
              Mode demo: semua akun demo memakai password <b>demo1234</b>, atau pilih peran di bawah untuk masuk langsung.
            </div>
            <div className="persona-list">
              {personas.map((p) => (
                <form key={p.email} action={demoLoginAction}>
                  <input type="hidden" name="email" value={p.email} />
                  <input type="hidden" name="next" value={next} />
                  <button type="submit" className="btn block">
                    <span>{p.name}</span>
                    <small>{p.label}</small>
                  </button>
                </form>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
