import { ENV_VERSION } from '@/lib/accounts';
import { getDb, getSession, requireUser } from '@/lib/session';
import { updateMyPhoneAction } from '@/app/actions';
import { findPerson } from '@/lib/master';
import { ROLE_LABEL } from '@/lib/users';
import { ChangePasswordForm } from './ChangePasswordForm';

export const metadata = { title: 'My account' };

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
          <h1>My account</h1>
          <p>Login details and password change.</p>
        </div>
      </div>

      {sp.ok ? <div className="flash ok">{sp.ok}</div> : null}
      {sp.err ? <div className="flash err">{sp.err}</div> : null}
      {sp.wajib ? (
        <div className="flash err">
          {envLogin && !acc?.hash
            ? 'You logged in with the initial password from the server. Create your own password before using the app.'
            : 'Your password was created or reset by a Superadmin. Change it to your own password before continuing.'}
        </div>
      ) : null}

      <div className="grid grid-2 stretch" style={{ paddingTop: 22, rowGap: 34 }}>
        <section className="mcard plain" style={{ ['--c' as string]: '#1ea5d8' }}>
          <div className="tab">Profile</div>
          <dl className="kv" style={{ gridTemplateColumns: '110px minmax(0,1fr)' }}>
            <dt>Name</dt>
            <dd>{user.name}</dd>
            <dt>Email</dt>
            <dd>{user.email}</dd>
            <dt>Access</dt>
            <dd>{acc?.akses || 'Superadmin'}</dd>
            <dt>Role</dt>
            <dd>{user.roles.map((r) => ROLE_LABEL[r]).join(', ')}</dd>
            <dt>Group</dt>
            <dd>{user.grup}</dd>
          </dl>
          {user.roles.includes('viewer') ? (
            <p className="subtle" style={{ marginTop: 10 }}>
              Your account name doesn't match Master_PIC / Master_Tim yet, so you have view-only access. Ask a Superadmin to match the name.
            </p>
          ) : null}
        </section>
        <section className="mcard plain" id="wa" style={{ ['--c' as string]: '#25a35a' }}>
          <div className="tab">WhatsApp number</div>
          <p className="subtle" style={{ marginTop: 0 }}>
            Used for task notifications, deadline reminders, and ACC/REV replies. Any format works (0812…, +62 812…); it's saved as 628….
          </p>
          {!me ? (
            <p className="subtle">Your account isn't linked to team/PIC data yet. Ask a Superadmin to set your work role first.</p>
          ) : (
            <form action={updateMyPhoneAction} className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: '1 1 200px', margin: 0 }}>
                <span>WhatsApp number</span>
                <input name="phone" defaultValue={me.phone} inputMode="tel" placeholder="0812 3456 7890" />
              </label>
              <button className="btn">Save</button>
            </form>
          )}
          {me && !me.phone ? <p style={{ marginTop: 10 }}><span className="badge red">No WhatsApp number</span> you won't get WhatsApp notifications.</p> : null}
        </section>
        <section className="mcard plain" style={{ ['--c' as string]: '#3a9a1e' }}>
          <div className="tab">Change password</div>
          <ChangePasswordForm currentLabel={envLogin && !acc?.hash ? 'Initial password (from Superadmin/server)' : 'Current password'} />
        </section>
      </div>
    </div>
  );
}
