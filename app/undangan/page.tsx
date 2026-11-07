import Link from 'next/link';
import { checkInvite } from '@/lib/accounts';
import { APP_NAME } from '@/lib/config';
import { getStore } from '@/lib/store';
import { InviteForm } from './InviteForm';

export const metadata = { title: 'Atur password' };
export const dynamic = 'force-dynamic';

export default async function UndanganPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const token = (await searchParams).token || '';
  const check = await checkInvite(await getStore(), token);
  return (
    <div className="login-wrap">
      <div className="mcard login-card" style={{ ['--c' as string]: '#2f6fed', marginTop: 22 }}>
        <div className="tab">{APP_NAME}</div>
        {check.ok ? (
          <>
            <h1 style={{ fontSize: 20, marginBottom: 4 }}>Halo, {check.nama}</h1>
            <p className="muted" style={{ marginTop: 0 }}>
              Buat password untuk akun <b>{check.email}</b>. Setelah disimpan kamu langsung masuk ke aplikasi.
            </p>
            <InviteForm token={token} email={check.email} />
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 20, marginBottom: 8 }}>Link tidak berlaku</h1>
            <div className="flash err">{check.message}</div>
            <Link href="/login" className="btn block">
              Ke halaman login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
