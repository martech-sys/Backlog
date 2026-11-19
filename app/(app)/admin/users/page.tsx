import Link from 'next/link';
import {
  changeEmailAction,
  generateSampleAction,
  purgeSampleAction,
  quickCreateAction,
  resetPasswordAction,
  deleteUserAction,
  setPhoneAction,
  updateUserAction,
} from '@/app/actions';
import { AddUserForm } from '@/components/admin/AddUserForm';
import { BlastInvitesButton, InviteButton } from '@/components/admin/InviteButton';
import { ProfileEditor } from '@/components/admin/ProfileEditor';
import { TestWaButton } from '@/components/admin/TestWaButton';
import { PasswordInput } from '@/components/PasswordInput';
import { SubmitButton } from '@/components/SubmitButton';
import { Flash } from '@/components/ui';
import { BOARD_COLORS } from '@/lib/backlog';
import { AKSES } from '@/lib/config';
import { now } from '@/lib/clock';
import { formatWaktu, todayWib } from '@/lib/dates';
import { TEST_WA_PER_DAY, testWaUsedToday } from '@/lib/wa';
import { emailConfigured } from '@/lib/mail';
import { findPerson, findPersonByEmail } from '@/lib/master';
import { describe, masterSuggestions, profileOf } from '@/lib/people';
import { countSample } from '@/lib/sample';
import { getDbWithWa, requireSuperadmin } from '@/lib/session';
import { getStore } from '@/lib/store';

export const metadata = { title: 'Manage users' };
// Membuat data contoh dan mengirim undangan massal bisa memakan beberapa detik.
export const maxDuration = 60;

type SP = Promise<Record<string, string | undefined>>;

const AKSES_LIST = [AKSES.USER, AKSES.ADMIN, AKSES.SUPERADMIN];

export default async function UsersPage({ searchParams }: { searchParams: SP }) {
  const me = await requireSuperadmin();
  const sp = await searchParams;
  const db = await getDbWithWa();
  const today = todayWib(now());
  const q = (sp.q || '').toLowerCase();
  const filter = sp.f || '';

  const personOf = (email: string, nama: string) => findPersonByEmail(db.master, email) || findPerson(db.master, nama);
  const rows = db.accounts
    .map((a) => ({ a, person: personOf(a.email, a.nama) }))
    .filter(({ a }) => !q || `${a.email} ${a.nama}`.toLowerCase().includes(q))
    .filter(({ a, person }) =>
      filter === 'belum-login'
        ? a.aktif && !a.lastLogin
        : filter === 'tanpa-wa'
          ? a.aktif && !person?.phone
          : filter === 'tanpa-peran'
            ? !person
            : true,
    )
    .sort((x, y) => Number(y.a.aktif) - Number(x.a.aktif) || x.a.nama.localeCompare(y.a.nama));

  const active = db.accounts.filter((a) => a.aktif);
  const neverLoggedIn = active.filter((a) => !a.lastLogin && a.email !== me.email);
  const noPhone = active.filter((a) => !personOf(a.email, a.nama)?.phone);
  const noRole = active.filter((a) => !personOf(a.email, a.nama));
  const hasAccount = (name: string, email: string) =>
    db.accounts.some((a) => a.nama.toLowerCase() === name.toLowerCase() || (email && a.email === email));
  const withoutAccount = db.master.people.filter((p) => p.active && !hasAccount(p.name, p.email));
  const brands = db.master.brands.filter((b) => b.active).map((b) => ({ name: b.name, grup: b.grup }));
  const sampleCounts = await countSample(await getStore());
  const hasSample = sampleCounts.requests + sampleCounts.tasks + sampleCounts.members > 0;
  const tab = (key: string, label: string, n?: number) => (
    <Link href={key ? `/admin/users?f=${key}#daftar` : '/admin/users#daftar'} className={filter === key ? 'active' : ''}>
      {label}
      {n !== undefined ? <span className="count">{n}</span> : null}
    </Link>
  );

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto' }}>
      <div className="page-head">
        <div>
          <h1>Manage users</h1>
          <p>
            <b>Access</b> decides which menus a user can open; <b>work role</b> decides task routing and WhatsApp notifications. Both are set
            here.
          </p>
        </div>
        <div className="title-box" style={{ fontSize: 14 }}>
          {active.length} active accounts · {neverLoggedIn.length} never logged in · {noPhone.length} without WhatsApp number
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      {!emailConfigured() ? (
        <div className="flash err">
          Invitation emails can't be sent because SMTP isn't set up (env <code>SMTP_HOST</code>, <code>SMTP_USER</code>,{' '}
          <code>SMTP_PASS</code>, <code>EMAIL_FROM</code>). Until then, invitation links are shown here to copy and send
          manually.
        </div>
      ) : null}

      <h2 className="section-title">
        <span className="num">1</span> Add user
      </h2>
      <section className="mcard plain" style={{ ['--c' as string]: BOARD_COLORS[2], marginTop: 22 }}>
        <div className="tab">New user</div>
        <AddUserForm brands={brands} suggestions={masterSuggestions(db.master)} />
      </section>

      <h2 className="section-title" id="daftar">
        <span className="num">2</span> User list
      </h2>
      <div
        className="row"
        style={{
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 10,
        }}
      >
        <div className="tabs" style={{ marginBottom: 0 }}>
          {tab('', 'All', db.accounts.length)}
          {tab('belum-login', 'Never logged in', neverLoggedIn.length)}
          {tab('tanpa-wa', 'No WhatsApp number', noPhone.length)}
          {tab('tanpa-peran', 'No work role', noRole.length)}
        </div>
        <BlastInvitesButton count={neverLoggedIn.length} />
      </div>
      <form className="filters" style={{ marginBottom: 12 }}>
        {filter ? <input type="hidden" name="f" value={filter} /> : null}
        <div className="field wide">
          <label htmlFor="q">Search</label>
          <input id="q" type="search" name="q" placeholder="Name or email" defaultValue={sp.q || ''} />
        </div>
        <button className="btn primary" type="submit">
          Search
        </button>
      </form>
      <div className="table-wrap">
        <table className="users">
          <thead>
            <tr>
              <th>Name & email</th>
              <th>Work role</th>
              <th>WhatsApp number</th>
              <th>Access</th>
              <th>Status</th>
              <th>Login</th>
              <th>Password</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty">
                  No users match this filter.
                </td>
              </tr>
            ) : (
              rows.map(({ a, person }) => {
                const self = a.email === me.email;
                const profile = profileOf(person, a.nama);
                const anchor = `u-edit-${a.email.replace(/[^a-z0-9]/gi, '')}`;
                const back = `/admin/users${filter ? `?f=${filter}` : ''}#${anchor}`;
                const phone = person?.phone || '';
                return (
                  <tr key={a.email} id={anchor} style={a.aktif ? undefined : { opacity: 0.55 }}>
                    <td style={{ minWidth: 190 }}>
                      <div className="cell-main">
                        <span className="title">
                          {a.nama || '-'} {self ? <span className="badge blue">You</span> : null}
                        </span>
                        <span className="subtle">{a.email}</span>
                      </div>
                      <div className="cell-actions">
                        <details>
                          <summary className="btn small">Change email</summary>
                          <form action={changeEmailAction} className="cell-panel">
                            <input type="hidden" name="email" value={a.email} />
                            <input type="email" name="newEmail" required placeholder="new email" />
                            <span className="subtle">Password stays the same; the old email can no longer be used to log in. A notice is sent to both emails.</span>
                            <SubmitButton className="btn small primary">Save email</SubmitButton>
                          </form>
                        </details>
                      </div>
                    </td>
                    <td style={{ minWidth: 170 }}>
                      <div className="cell-main">
                        {person ? (
                          <>
                            <span>{describe(profile)}</span>
                            {profile.jabatan ? <span className="subtle">{profile.jabatan}</span> : null}
                          </>
                        ) : a.akses !== AKSES.USER ? (
                          <span className="subtle">{a.akses} (no work role)</span>
                        ) : (
                          <span>
                            <span className="badge amber">No role yet</span>
                          </span>
                        )}
                      </div>
                      <div className="cell-actions">
                        <details>
                          <summary className="btn small">Edit role</summary>
                          <div className="cell-panel" style={{ maxWidth: 'none' }}>
                            <ProfileEditor email={a.email} initial={profile} brands={brands} peranRequired={a.akses === AKSES.USER} />
                          </div>
                        </details>
                      </div>
                    </td>
                    <td style={{ minWidth: 170 }}>
                      <div className="cell-main">
                        {phone ? <span className="nowrap">{phone}</span> : <span><span className="badge red">No WhatsApp number</span></span>}
                      </div>
                      {person ? (
                        <div className="cell-actions">
                          {phone ? (
                            <TestWaButton
                              to={phone}
                              nama={person.name}
                              limit={TEST_WA_PER_DAY}
                              remaining={Math.max(0, TEST_WA_PER_DAY - testWaUsedToday(db.waLog, phone, today))}
                            />
                          ) : null}
                          <details>
                            <summary className="btn small">{phone ? 'Edit' : '+ Add WhatsApp number'}</summary>
                            <form action={setPhoneAction} className="cell-panel">
                              <input type="hidden" name="email" value={a.email} />
                              <input type="hidden" name="nama" value={person.name} />
                              <input type="hidden" name="back" value={back} />
                              <input name="phone" inputMode="tel" defaultValue={phone} placeholder="0812 3456 7890" aria-label={`WhatsApp number for ${person.name}`} />
                              <SubmitButton className="btn small primary">Save number</SubmitButton>
                            </form>
                          </details>
                        </div>
                      ) : (
                        <div className="cell-note subtle" style={{ marginTop: 6 }}>
                          Set a work role first; the WhatsApp number can be added under Edit role.
                        </div>
                      )}
                    </td>
                    <td style={{ minWidth: 130 }}>
                      <form action={updateUserAction} className="stack" style={{ gap: 8 }}>
                        <input type="hidden" name="email" value={a.email} />
                        <select name="akses" defaultValue={a.akses} disabled={self} style={{ width: 124 }}>
                          {AKSES_LIST.map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                        {self ? null : (
                          <div>
                            <SubmitButton className="btn small">Save access</SubmitButton>
                          </div>
                        )}
                      </form>
                    </td>
                    <td style={{ minWidth: 175 }}>
                      <div className="cell-main">
                        <span>
                          <span className={`badge ${a.aktif ? 'green' : ''}`}>{a.aktif ? 'Active' : 'Inactive'}</span>
                        </span>
                      </div>
                      {self ? null : (
                        <div className="cell-actions">
                          <form action={updateUserAction}>
                            <input type="hidden" name="email" value={a.email} />
                            <input type="hidden" name="aktif" value={a.aktif ? 'Tidak' : 'Ya'} />
                            <SubmitButton className="btn small">{a.aktif ? 'Deactivate' : 'Activate'}</SubmitButton>
                          </form>
                          <details>
                            <summary className="btn small danger">Delete</summary>
                            <form action={deleteUserAction} className="cell-panel">
                              <input type="hidden" name="email" value={a.email} />
                              <input type="hidden" name="back" value={`/admin/users${filter ? `?f=${filter}` : ''}#daftar`} />
                              <span className="subtle">
                                Permanently delete <b>{a.nama}</b>'s account? Their task history & comments are kept.
                              </span>
                              <label className="row" style={{ gap: 6, alignItems: 'flex-start', flexWrap: 'nowrap', fontSize: 12 }}>
                                <input type="checkbox" name="deactivate" value="Ya" defaultChecked style={{ marginTop: 2 }} />
                                <span>Also deactivate in team/PIC (no more tasks &amp; WhatsApp)</span>
                              </label>
                              <SubmitButton className="btn small danger" pendingText="Deleting…">
                                Yes, delete user
                              </SubmitButton>
                            </form>
                          </details>
                        </div>
                      )}
                    </td>
                    <td style={{ minWidth: 150 }}>
                      <div className="cell-main">
                        {a.lastLogin ? (
                          <span className="nowrap">{formatWaktu(a.lastLogin)}</span>
                        ) : (
                          <>
                            <span>
                              <span className="badge amber">Never logged in</span>
                            </span>
                            {a.invitedAt ? <span className="subtle">Invited: {formatWaktu(a.invitedAt)}</span> : null}
                          </>
                        )}
                      </div>
                      {!a.lastLogin && a.aktif && !self ? (
                        <div className="cell-actions">
                          <InviteButton email={a.email} nama={a.nama} label={a.invitedAt ? 'Resend invitation' : 'Send invitation'} />
                        </div>
                      ) : null}
                    </td>
                    <td style={{ minWidth: 110 }}>
                      <div className="cell-main">
                        <span className="subtle">{!a.hash ? 'Not set' : a.mustChange ? 'Must change' : 'Set'}</span>
                      </div>
                      <div className="cell-actions">
                        <details>
                          <summary className="btn small">Reset</summary>
                          <form action={resetPasswordAction} className="cell-panel" style={{ minWidth: 260 }}>
                            <input type="hidden" name="email" value={a.email} />
                            <PasswordInput name="password" generate autoGenerate />
                            <SubmitButton className="btn small primary">Save new password</SubmitButton>
                          </form>
                        </details>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">
        <span className="num">3</span> People in master data without an account
        <span className="hint">· create account + send invitation in one click</span>
      </h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Work role</th>
              <th>Email</th>
              <th>WhatsApp number</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {withoutAccount.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  Everyone in master data already has an account.
                </td>
              </tr>
            ) : (
              withoutAccount.map((p) => {
                const formId = `quick-${p.name.replace(/[^a-z0-9]/gi, '-')}`;
                return (
                  <tr key={p.name}>
                    <td className="title">
                      <form id={formId} action={quickCreateAction}>
                        <input type="hidden" name="nama" value={p.name} />
                      </form>
                      {p.name}
                    </td>
                    <td>{describe(profileOf(p))}</td>
                    <td style={{ minWidth: 220 }}>
                      <input form={formId} name="email" type="email" required defaultValue={p.email} placeholder="login email" />
                    </td>
                    <td style={{ minWidth: 150 }}>
                      <input form={formId} name="phone" type="text" inputMode="tel" defaultValue={p.phone} placeholder="08…" />
                    </td>
                    <td>
                      <button type="submit" form={formId} className="btn small primary">
                        Create account & invite
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <h2 className="section-title" id="data-contoh">
        <span className="num">4</span> Sample data
        <span className="hint">· to see the flow & insights before real data comes in</span>
      </h2>
      <section className="mcard plain" style={{ ['--c' as string]: BOARD_COLORS[8], marginTop: 22 }}>
        <div className="tab">Sample data (IDs starting with DEMO-)</div>
        {hasSample ? (
          <>
            <p style={{ marginTop: 0 }}>
              There are currently <b>{sampleCounts.requests}</b> requests, <b>{sampleCounts.tasks}</b> tasks, <b>{sampleCounts.statusLog}</b> status
              history entries, <b>{sampleCounts.waLog}</b> WhatsApp log entries, and <b>{sampleCounts.members}</b> team members marked &quot;(contoh)&quot;.
              Real data (IDs not starting with DEMO-) is not deleted.
            </p>
            <form action={purgeSampleAction}>
              <SubmitButton className="btn danger" pendingText="Deleting…">
                Delete all sample data
              </SubmitButton>
            </form>
          </>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>
              Creates ±6 weeks of sample activity (±70 requests) from the current master data, including brief checks, assignment, drafts, QC,
              revisions, ACC, final, status history, and WhatsApp log. No WhatsApp messages or emails are actually sent.
            </p>
            <form action={generateSampleAction}>
              <SubmitButton className="btn primary" pendingText="Creating sample data… (±10–30 seconds)">
                Create sample data
              </SubmitButton>
            </form>
          </>
        )}
      </section>
      <p className="subtle" style={{ marginTop: 16 }}>
        WhatsApp settings (gateway status, test mode, sending a test message) are on the <Link href="/admin/whatsapp">WhatsApp settings</Link> page.
      </p>
    </div>
  );
}
