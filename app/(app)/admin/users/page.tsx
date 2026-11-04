import {
  createUserAction,
  generateSampleAction,
  purgeSampleAction,
  resetPasswordAction,
  testWaAction,
  updateUserAction,
} from '@/app/actions';
import { PasswordInput } from '@/components/PasswordInput';
import { SubmitButton } from '@/components/SubmitButton';
import { Flash } from '@/components/ui';
import { BOARD_COLORS } from '@/lib/backlog';
import { AKSES } from '@/lib/config';
import { formatWaktu } from '@/lib/dates';
import { env } from '@/lib/env';
import { findPerson, findPersonByEmail } from '@/lib/master';
import { countSample } from '@/lib/sample';
import { getDb, requireSuperadmin } from '@/lib/session';
import { getStore } from '@/lib/store';
import { gatewayStatus } from '@/lib/wa';

export const metadata = { title: 'Kelola user' };
// Membuat data contoh bisa memakan beberapa detik.
export const maxDuration = 60;

type SP = Promise<Record<string, string | undefined>>;

const AKSES_LIST = [AKSES.USER, AKSES.ADMIN, AKSES.SUPERADMIN];
const AKSES_HELP: Record<string, string> = {
  User: 'Sesuai peran di master data (PIC, Traffic, Lead, Tim)',
  Admin: 'Semua aksi + koreksi status',
  Superadmin: 'Admin + kelola user',
};

export default async function UsersPage({ searchParams }: { searchParams: SP }) {
  const me = await requireSuperadmin();
  const sp = await searchParams;
  const db = await getDb();
  const q = (sp.q || '').toLowerCase();

  const accounts = db.accounts
    .filter((a) => !q || `${a.email} ${a.nama}`.toLowerCase().includes(q))
    .sort((a, b) => Number(b.aktif) - Number(a.aktif) || a.nama.localeCompare(b.nama));
  const hasAccount = (name: string, email: string) =>
    db.accounts.some((a) => a.nama.toLowerCase() === name.toLowerCase() || (email && a.email === email));
  const withoutAccount = db.master.people.filter((p) => p.active && !hasAccount(p.name, p.email));
  const masterNames = db.master.people.filter((p) => p.active).map((p) => p.name);
  const sampleCounts = await countSample(await getStore());
  const hasSample = sampleCounts.requests + sampleCounts.tasks + sampleCounts.members > 0;
  const wa = await gatewayStatus();
  const webhookUrl = `${env.appUrl}/api/wa/webhook${env.webhookKey ? '?key=<WEBHOOK_KEY>' : ''}`;

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <div className="page-head">
        <div>
          <h1>Kelola user</h1>
          <p>
            Tambah akun login, reset password, dan atur akses. Peran kerja (PIC, Traffic, Lead, Tim) mengikuti <b>Nama</b> di
            Master_PIC / Master_Tim.
          </p>
        </div>
        <div className="title-box" style={{ fontSize: 14 }}>
          {db.accounts.filter((a) => a.aktif).length} akun aktif · {withoutAccount.length} orang belum punya akun
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <h2 className="section-title">
        <span className="num">1</span> Tambah user
      </h2>
      <section className="mcard plain" style={{ ['--c' as string]: BOARD_COLORS[2], marginTop: 22 }}>
        <div className="tab">User baru</div>
        <form action={createUserAction} className="stack">
          <datalist id="master-names">
            {masterNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="new-email">Email</label>
              <input id="new-email" name="email" type="email" required placeholder="nama@heymale.id" autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="new-nama">Nama</label>
              <input id="new-nama" name="nama" type="text" required list="master-names" placeholder="Pilih dari master atau ketik" autoComplete="off" />
              <span className="help">Samakan dengan nama di Master_PIC / Master_Tim agar peran terbaca.</span>
            </div>
            <div className="field">
              <label htmlFor="new-akses">Akses</label>
              <select id="new-akses" name="akses" defaultValue={AKSES.USER}>
                {AKSES_LIST.map((a) => (
                  <option key={a} value={a}>
                    {a}: {AKSES_HELP[a]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="new-pass">Password awal</label>
              <PasswordInput id="new-pass" name="password" generate autoGenerate />
              <span className="help">Salin dan bagikan ke user. Password tidak bisa dilihat lagi setelah disimpan.</span>
            </div>
          </div>
          <div className="row">
            <label className="choice">
              <input type="checkbox" name="mustChange" value="Ya" defaultChecked /> Wajib ganti password saat login pertama
            </label>
            <span className="spacer" />
            <SubmitButton>Tambah user</SubmitButton>
          </div>
        </form>
      </section>

      <h2 className="section-title">
        <span className="num">2</span> Daftar user
      </h2>
      <form className="filters" style={{ marginBottom: 12 }}>
        <div className="field wide">
          <label htmlFor="q">Cari</label>
          <input id="q" type="search" name="q" placeholder="Nama atau email" defaultValue={sp.q || ''} />
        </div>
        <button className="btn primary" type="submit">
          Cari
        </button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Email</th>
              <th>Peran kerja</th>
              <th>Akses</th>
              <th>Status</th>
              <th>Login terakhir</th>
              <th>Reset password</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty">
                  Belum ada user.
                </td>
              </tr>
            ) : (
              accounts.map((a) => {
                const person = findPerson(db.master, a.nama) || findPersonByEmail(db.master, a.email);
                const self = a.email === me.email;
                return (
                  <tr key={a.email} style={a.aktif ? undefined : { opacity: 0.55 }}>
                    <td>
                      <div className="title">{a.nama || '-'}</div>
                      {self ? <span className="badge blue">Kamu</span> : null}
                    </td>
                    <td className="nowrap">{a.email}</td>
                    <td>
                      {person ? (
                        <>
                          {person.peran}
                          <div className="subtle">{person.grup}</div>
                        </>
                      ) : a.akses !== AKSES.USER ? (
                        <span className="subtle">{a.akses} (tanpa peran kerja)</span>
                      ) : (
                        <span className="badge amber" title="Nama tidak ditemukan di Master_PIC / Master_Tim: akses hanya melihat">
                          Tidak terhubung
                        </span>
                      )}
                    </td>
                    <td>
                      <form action={updateUserAction} className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                        <input type="hidden" name="email" value={a.email} />
                        <select name="akses" defaultValue={a.akses} disabled={self} style={{ minWidth: 120 }}>
                          {AKSES_LIST.map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                        {self ? null : (
                          <SubmitButton className="btn small" pendingText="…">
                            Simpan
                          </SubmitButton>
                        )}
                      </form>
                    </td>
                    <td>
                      <form action={updateUserAction}>
                        <input type="hidden" name="email" value={a.email} />
                        <input type="hidden" name="aktif" value={a.aktif ? 'Tidak' : 'Ya'} />
                        <span className={`badge ${a.aktif ? 'green' : ''}`} style={{ marginRight: 6 }}>
                          {a.aktif ? 'Aktif' : 'Nonaktif'}
                        </span>
                        {self ? null : (
                          <SubmitButton className={`btn small${a.aktif ? ' danger' : ''}`} pendingText="…">
                            {a.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                          </SubmitButton>
                        )}
                      </form>
                    </td>
                    <td className="nowrap">
                      {a.lastLogin ? formatWaktu(a.lastLogin) : <span className="subtle">belum pernah</span>}
                      {a.mustChange ? <div className="subtle">menunggu ganti password</div> : null}
                      {!a.hash ? <div className="subtle">belum punya password</div> : null}
                    </td>
                    <td style={{ minWidth: 300 }}>
                      <details>
                        <summary className="btn small">Reset</summary>
                        <form action={resetPasswordAction} className="stack" style={{ marginTop: 8 }}>
                          <input type="hidden" name="email" value={a.email} />
                          <PasswordInput name="password" generate autoGenerate />
                          <SubmitButton className="btn small primary">Simpan password baru</SubmitButton>
                        </form>
                      </details>
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
        <span className="hint">· buat akun sekali klik</span>
      </h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Peran</th>
              <th>Email</th>
              <th>Password awal</th>
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
                    <td className="title">{p.name}</td>
                    <td>
                      {p.peran}
                      <div className="subtle">{p.grup}</div>
                    </td>
                    <td style={{ minWidth: 220 }}>
                      <input form={formId} name="email" type="email" required defaultValue={p.email} placeholder="email login" />
                    </td>
                    <td style={{ minWidth: 280 }}>
                      <form id={formId} action={createUserAction}>
                        <input type="hidden" name="nama" value={p.name} />
                        <input type="hidden" name="akses" value={AKSES.USER} />
                        <input type="hidden" name="mustChange" value="Ya" />
                        <PasswordInput name="password" generate autoGenerate />
                      </form>
                    </td>
                    <td>
                      <button type="submit" form={formId} className="btn small primary">
                        Buat akun
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="subtle">Setelah dibuat, user wajib mengganti password saat login pertama. Akun nonaktif tidak bisa login dan sesinya langsung berhenti.</p>

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
              status, <b>{sampleCounts.waLog}</b> log WA, dan <b>{sampleCounts.members}</b> anggota tim bertanda &quot;(contoh)&quot;.
              Data asli (ID berawalan selain DEMO-) tidak ikut terhapus.
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
              Membuat ±6 minggu aktivitas contoh (±70 request di semua brand dan kategori) memakai master data saat ini, lengkap dengan
              cek brief, assign, draft, QC, revisi, ACC, final, riwayat status, dan log WA. Ditambah beberapa anggota tim bertanda
              &quot;(contoh)&quot;. Tidak ada WA yang benar-benar dikirim.
            </p>
            <form action={generateSampleAction}>
              <SubmitButton className="btn primary" pendingText="Membuat data contoh… (±10–30 detik)">
                Buat data contoh
              </SubmitButton>
            </form>
          </>
        )}
      </section>

      <h2 className="section-title" id="whatsapp">
        <span className="num">5</span> WhatsApp gateway
        <span className="hint">· {wa.provider === 'lixus' ? 'Lixus WhatsApp Gateway' : wa.provider}</span>
      </h2>
      <section className="mcard plain" style={{ ['--c' as string]: BOARD_COLORS[2], marginTop: 22 }}>
        <div className="tab">Status & tes kirim</div>
        <dl className="kv" style={{ gridTemplateColumns: '170px minmax(0,1fr)' }}>
          <dt>Koneksi sesi WA</dt>
          <dd>
            {wa.connected === true ? (
              <span className="badge green">Terhubung{wa.phoneNumber ? ` · ${wa.phoneNumber}` : ''}{wa.uptime ? ` · ${wa.uptime}` : ''}</span>
            ) : wa.connected === false ? (
              <span className="badge red">Tidak terhubung{wa.error ? ` · ${wa.error}` : ''}</span>
            ) : (
              <span className="badge outline">{wa.configured ? 'Tidak dicek' : 'Belum dikonfigurasi (WA_API_URL & WA_TOKEN)'}</span>
            )}
          </dd>
          <dt>Mode kirim</dt>
          <dd>
            {wa.dryRun ? (
              <span className="badge amber">Uji (WA_DRY_RUN): pesan hanya dicatat di Log_WA</span>
            ) : (
              <span className="badge green">Kirim sungguhan</span>
            )}
          </dd>
          <dt>URL webhook</dt>
          <dd>
            <code>{webhookUrl}</code>
            <div className="subtle">
              Daftarkan di Ops Panel Lixus untuk event <code>message.received</code> agar balasan ACC/REV dari PIC terbaca.
              {env.webhookKey ? ' Ganti <WEBHOOK_KEY> dengan nilai env WEBHOOK_KEY.' : ' Isi env WEBHOOK_KEY atau WA_WEBHOOK_SECRET agar webhook diterima.'}
            </div>
          </dd>
        </dl>
        <form action={testWaAction} className="form-grid" style={{ marginTop: 14, alignItems: 'end' }}>
          <div className="field">
            <label htmlFor="wa-to">Nomor tujuan</label>
            <input id="wa-to" name="to" type="text" inputMode="tel" placeholder="08123456789 atau 628123456789" required />
          </div>
          <div className="field">
            <label htmlFor="wa-text">Pesan (opsional)</label>
            <input id="wa-text" name="text" type="text" placeholder="Tes dari Creative Request Tracker" />
          </div>
          <div>
            <SubmitButton pendingText="Mengirim…">Kirim pesan tes</SubmitButton>
          </div>
        </form>
      </section>
    </div>
  );
}
