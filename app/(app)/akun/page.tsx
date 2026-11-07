import { ENV_VERSION } from '@/lib/accounts';
import { getDb, getSession, requireUser } from '@/lib/session';
import { updateMyPhoneAction } from '@/app/actions';
import { findPerson } from '@/lib/master';
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
  const me = findPerson(db.master, user.name);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div className="page-head">
        <div>
          <h1>Akun saya</h1>
          <p>Data login dan ganti password.</p>
        </div>
      </div>

      {sp.ok ? <div className="flash ok">{sp.ok}</div> : null}
      {sp.err ? <div className="flash err">{sp.err}</div> : null}
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
        <section className="mcard plain" id="wa" style={{ ['--c' as string]: '#25a35a' }}>
          <div className="tab">Nomor WhatsApp</div>
          <p className="subtle" style={{ marginTop: 0 }}>
            Dipakai untuk notifikasi tugas, reminder deadline, dan balasan ACC/REV. Tulis bebas (0812…, +62 812…); sistem menyimpannya sebagai 628….
          </p>
          {!me ? (
            <p className="subtle">Akunmu belum terhubung ke data tim/PIC. Minta Superadmin mengisi peran kerjamu dulu.</p>
          ) : (
            <form action={updateMyPhoneAction} className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 200px', margin: 0 }}>
                <span>No WA</span>
                <input name="phone" defaultValue={me.phone} inputMode="tel" placeholder="0812 3456 7890" />
              </label>
              <button className="btn">Simpan</button>
            </form>
          )}
          {me && !me.phone ? <p style={{ marginTop: 10 }}><span className="badge red">No WA kosong</span> kamu tidak menerima notifikasi WA.</p> : null}
        </section>
        <section className="mcard plain" style={{ ['--c' as string]: '#3a9a1e' }}>
          <div className="tab">Ganti password</div>
          <ChangePasswordForm currentLabel={envLogin && !acc?.hash ? 'Password awal (dari Superadmin/server)' : 'Password saat ini'} />
        </section>
      </div>
    </div>
  );
}
