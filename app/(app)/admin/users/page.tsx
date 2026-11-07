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

export const metadata = { title: 'Kelola user' };
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
          <h1>Kelola user</h1>
          <p>
            <b>Akses</b> menentukan menu yang bisa dibuka; <b>peran kerja</b> menentukan routing task dan notifikasi WA. Keduanya diatur di
            sini.
          </p>
        </div>
        <div className="title-box" style={{ fontSize: 14 }}>
          {active.length} akun aktif · {neverLoggedIn.length} belum login · {noPhone.length} tanpa No WA
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      {!emailConfigured() ? (
        <div className="flash err">
          Email undangan belum bisa dikirim karena SMTP belum diatur (env <code>SMTP_HOST</code>, <code>SMTP_USER</code>,{' '}
          <code>SMTP_PASS</code>, <code>EMAIL_FROM</code>). Sementara itu, link undangan ditampilkan di sini untuk disalin dan dikirim
          manual.
        </div>
      ) : null}

      <h2 className="section-title">
        <span className="num">1</span> Tambah user
      </h2>
      <section className="mcard plain" style={{ ['--c' as string]: BOARD_COLORS[2], marginTop: 22 }}>
        <div className="tab">User baru</div>
        <AddUserForm brands={brands} suggestions={masterSuggestions(db.master)} />
      </section>

      <h2 className="section-title" id="daftar">
        <span className="num">2</span> Daftar user
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
          {tab('', 'Semua', db.accounts.length)}
          {tab('belum-login', 'Belum pernah login', neverLoggedIn.length)}
          {tab('tanpa-wa', 'No WA kosong', noPhone.length)}
          {tab('tanpa-peran', 'Tanpa peran kerja', noRole.length)}
        </div>
        <BlastInvitesButton count={neverLoggedIn.length} />
      </div>
      <form className="filters" style={{ marginBottom: 12 }}>
        {filter ? <input type="hidden" name="f" value={filter} /> : null}
        <div className="field wide">
          <label htmlFor="q">Cari</label>
          <input id="q" type="search" name="q" placeholder="Nama atau email" defaultValue={sp.q || ''} />
        </div>
        <button className="btn primary" type="submit">
          Cari
        </button>
      </form>
      <div className="table-wrap">
        <table className="users">
          <thead>
            <tr>
              <th>Nama & email</th>
              <th>Peran kerja</th>
              <th>No WA</th>
              <th>Akses</th>
              <th>Status</th>
              <th>Login</th>
              <th>Password</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty">
                  Tidak ada user di filter ini.
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
                          {a.nama || '-'} {self ? <span className="badge blue">Kamu</span> : null}
                        </span>
                        <span className="subtle">{a.email}</span>
                      </div>
                      <div className="cell-actions">
                        <details>
                          <summary className="btn small">Ubah email</summary>
                          <form action={changeEmailAction} className="cell-panel">
                            <input type="hidden" name="email" value={a.email} />
                            <input type="email" name="newEmail" required placeholder="email baru" />
                            <span className="subtle">Password tetap; email lama tidak bisa dipakai login lagi. Pemberitahuan dikirim ke kedua email.</span>
                            <SubmitButton className="btn small primary">Simpan email</SubmitButton>
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
                          <span className="subtle">{a.akses} (tanpa peran kerja)</span>
                        ) : (
                          <span>
                            <span className="badge amber">Belum ada peran</span>
                          </span>
                        )}
                      </div>
                      <div className="cell-actions">
                        <details>
                          <summary className="btn small">Ubah peran</summary>
                          <div className="cell-panel" style={{ maxWidth: 'none' }}>
                            <ProfileEditor email={a.email} initial={profile} brands={brands} peranRequired={a.akses === AKSES.USER} />
                          </div>
                        </details>
                      </div>
                    </td>
                    <td style={{ minWidth: 170 }}>
                      <div className="cell-main">
                        {phone ? <span className="nowrap">{phone}</span> : <span><span className="badge red">No WA kosong</span></span>}
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
                            <summary className="btn small">{phone ? 'Ubah' : '+ Tambah No WA'}</summary>
                            <form action={setPhoneAction} className="cell-panel">
                              <input type="hidden" name="email" value={a.email} />
                              <input type="hidden" name="nama" value={person.name} />
                              <input type="hidden" name="back" value={back} />
                              <input name="phone" inputMode="tel" defaultValue={phone} placeholder="0812 3456 7890" aria-label={`No WA ${person.name}`} />
                              <SubmitButton className="btn small primary">Simpan No WA</SubmitButton>
                            </form>
                          </details>
                        </div>
                      ) : (
                        <div className="cell-note subtle" style={{ marginTop: 6 }}>
                          Isi peran kerja dulu; No WA bisa diisi di Ubah peran.
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
                            <SubmitButton className="btn small">Simpan akses</SubmitButton>
                          </div>
                        )}
                      </form>
                    </td>
                    <td style={{ minWidth: 175 }}>
                      <div className="cell-main">
                        <span>
                          <span className={`badge ${a.aktif ? 'green' : ''}`}>{a.aktif ? 'Aktif' : 'Nonaktif'}</span>
                        </span>
                      </div>
                      {self ? null : (
                        <div className="cell-actions">
                          <form action={updateUserAction}>
                            <input type="hidden" name="email" value={a.email} />
                            <input type="hidden" name="aktif" value={a.aktif ? 'Tidak' : 'Ya'} />
                            <SubmitButton className="btn small">{a.aktif ? 'Nonaktifkan' : 'Aktifkan'}</SubmitButton>
                          </form>
                          <details>
                            <summary className="btn small danger">Hapus</summary>
                            <form action={deleteUserAction} className="cell-panel">
                              <input type="hidden" name="email" value={a.email} />
                              <input type="hidden" name="back" value={`/admin/users${filter ? `?f=${filter}` : ''}#daftar`} />
                              <span className="subtle">
                                Hapus akun <b>{a.nama}</b> permanen? Riwayat task & komentarnya tetap tersimpan.
                              </span>
                              <label className="row" style={{ gap: 6, alignItems: 'flex-start', flexWrap: 'nowrap', fontSize: 12 }}>
                                <input type="checkbox" name="deactivate" value="Ya" defaultChecked style={{ marginTop: 2 }} />
                                <span>Nonaktifkan juga dari tim/PIC (tidak menerima tugas &amp; WA)</span>
                              </label>
                              <SubmitButton className="btn small danger" pendingText="Menghapus…">
                                Ya, hapus user
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
                              <span className="badge amber">Belum pernah login</span>
                            </span>
                            {a.invitedAt ? <span className="subtle">Undangan: {formatWaktu(a.invitedAt)}</span> : null}
                          </>
                        )}
                      </div>
                      {!a.lastLogin && a.aktif && !self ? (
                        <div className="cell-actions">
                          <InviteButton email={a.email} nama={a.nama} label={a.invitedAt ? 'Kirim ulang undangan' : 'Kirim undangan'} />
                        </div>
                      ) : null}
                    </td>
                    <td style={{ minWidth: 110 }}>
                      <div className="cell-main">
                        <span className="subtle">{!a.hash ? 'Belum dibuat' : a.mustChange ? 'Wajib ganti' : 'Sudah diatur'}</span>
                      </div>
                      <div className="cell-actions">
                        <details>
                          <summary className="btn small">Reset</summary>
                          <form action={resetPasswordAction} className="cell-panel" style={{ minWidth: 260 }}>
                            <input type="hidden" name="email" value={a.email} />
                            <PasswordInput name="password" generate autoGenerate />
                            <SubmitButton className="btn small primary">Simpan password baru</SubmitButton>
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
        <span className="num">3</span> Orang di master data yang belum punya akun
        <span className="hint">· buat akun + kirim undangan sekali klik</span>
      </h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Peran kerja</th>
              <th>Email</th>
              <th>No WA</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {withoutAccount.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  Semua orang di master data sudah punya akun.
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
                      <input form={formId} name="email" type="email" required defaultValue={p.email} placeholder="email login" />
                    </td>
                    <td style={{ minWidth: 150 }}>
                      <input form={formId} name="phone" type="text" inputMode="tel" defaultValue={p.phone} placeholder="08…" />
                    </td>
                    <td>
                      <button type="submit" form={formId} className="btn small primary">
                        Buat akun & undang
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
        <span className="num">4</span> Data contoh
        <span className="hint">· untuk melihat alur & insight sebelum data asli masuk</span>
      </h2>
      <section className="mcard plain" style={{ ['--c' as string]: BOARD_COLORS[8], marginTop: 22 }}>
        <div className="tab">Data contoh (ID berawalan DEMO-)</div>
        {hasSample ? (
          <>
            <p style={{ marginTop: 0 }}>
              Saat ini ada <b>{sampleCounts.requests}</b> request, <b>{sampleCounts.tasks}</b> task, <b>{sampleCounts.statusLog}</b> riwayat
              status, <b>{sampleCounts.waLog}</b> log WA, dan <b>{sampleCounts.members}</b> anggota tim bertanda &quot;(contoh)&quot;. Data
              asli (ID berawalan selain DEMO-) tidak ikut terhapus.
            </p>
            <form action={purgeSampleAction}>
              <SubmitButton className="btn danger" pendingText="Menghapus…">
                Hapus semua data contoh
              </SubmitButton>
            </form>
          </>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>
              Membuat ±6 minggu aktivitas contoh (±70 request) memakai master data saat ini, lengkap dengan cek brief, assign, draft, QC,
              revisi, ACC, final, riwayat status, dan log WA. Tidak ada WA atau email yang benar-benar dikirim.
            </p>
            <form action={generateSampleAction}>
              <SubmitButton className="btn primary" pendingText="Membuat data contoh… (±10–30 detik)">
                Buat data contoh
              </SubmitButton>
            </form>
          </>
        )}
      </section>
      <p className="subtle" style={{ marginTop: 16 }}>
        Pengaturan WhatsApp (status gateway, mode uji, kirim pesan tes) ada di halaman <Link href="/admin/whatsapp">Pengaturan WA</Link>.
      </p>
    </div>
  );
}
