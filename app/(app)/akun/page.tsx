import { ENV_VERSION } from '@/lib/accounts';
import { getDb, getSession, requireUser } from '@/lib/session';
import { ROLE_LABEL } from '@/lib/users';
import { ChangePasswordForm } from './ChangePasswordForm';

export const metadata = { title: 'Akun saya' };

export default async function AkunPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const session = await getSession();
  const db = await getDb();
  const acc = db.accounts.find((a) => a.email === user.email);
  const envLogin = session?.v === ENV_VERSION;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="page-head">
        <div>
          <h1>Akun saya</h1>
          <p>Data login dan ganti password.</p>
        </div>
      </div>

      {sp.wajib ? (
        <div className="flash err">
          {envLogin && !acc?.hash
            ? 'Kamu masuk dengan password awal dari server. Buat password pribadi dulu sebelum memakai aplikasi.'
            : 'Password kamu dibuat atau di-reset oleh Superadmin. Ganti dengan password pribadi sebelum melanjutkan.'}
        </div>
      ) : null}

      <div className="grid grid-2 stretch" style={{ paddingTop: 22, rowGap: 34 }}>
        <section className="mcard plain" style={{ ['--c' as string]: '#1ea5d8' }}>
          <div className="tab">Profil</div>
          <dl className="kv" style={{ gridTemplateColumns: '110px minmax(0,1fr)' }}>
            <dt>Nama</dt>
            <dd>{user.name}</dd>
            <dt>Email</dt>
            <dd>{user.email}</dd>
            <dt>Akses</dt>
            <dd>{acc?.akses || 'Superadmin'}</dd>
            <dt>Peran</dt>
            <dd>{user.roles.map((r) => ROLE_LABEL[r]).join(', ')}</dd>
            <dt>Grup</dt>
            <dd>{user.grup}</dd>
          </dl>
          {user.roles.includes('viewer') ? (
            <p className="subtle" style={{ marginTop: 10 }}>
              Nama akunmu belum cocok dengan Master_PIC / Master_Tim, jadi aksesmu hanya melihat. Minta Superadmin menyamakan nama.
            </p>
          ) : null}
        </section>
        <section className="mcard plain" style={{ ['--c' as string]: '#3a9a1e' }}>
          <div className="tab">Ganti password</div>
          <ChangePasswordForm currentLabel={envLogin && !acc?.hash ? 'Password awal (dari Superadmin/server)' : 'Password saat ini'} />
        </section>
      </div>
    </div>
  );
}
