import Link from 'next/link';
import { setWaModeAction, testWaAction } from '@/app/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Flash } from '@/components/ui';
import { BOARD_COLORS } from '@/lib/backlog';
import { env } from '@/lib/env';
import { findPerson, findPersonByEmail } from '@/lib/master';
import { getDbWithWa, requireSuperadmin } from '@/lib/session';
import { gatewayStatus, waStatus, WA_MAX_TRIES } from '@/lib/wa';

export const metadata = { title: 'Pengaturan WA' };
export const maxDuration = 30;

type SP = Promise<Record<string, string | undefined>>;

const STATUS_BADGE: Record<string, string> = { Terkirim: 'green', Gagal: 'red', Dilewati: 'amber', DRY_RUN: 'outline', Masuk: 'blue' };

export default async function WhatsappPage({ searchParams }: { searchParams: SP }) {
  await requireSuperadmin();
  const sp = await searchParams;
  const db = await getDbWithWa();
  const cfg = db.master.config.waDryRun;
  const st = await gatewayStatus(cfg);
  const source = cfg === null ? 'mengikuti env WA_DRY_RUN di Vercel' : 'diatur dari halaman ini (tab Config)';

  const people = db.accounts
    .filter((a) => a.aktif)
    .map((a) => ({ a, p: findPersonByEmail(db.master, a.email) || findPerson(db.master, a.nama) }))
    .filter((x) => x.p);
  const noPhone = people.filter((x) => !x.p!.phone);

  const filter = sp.s || '';
  const out = db.waLog.filter((l) => l.Arah === 'OUT').reverse();
  const counts = out.reduce<Record<string, number>>((m, l) => ((m[waStatus(l.Hasil)] = (m[waStatus(l.Hasil)] || 0) + 1), m), {});
  const logs = out.filter((l) => !filter || waStatus(l.Hasil) === filter).slice(0, 60);
  const tab = (key: string, label: string) => (
    <Link href={key ? `/admin/whatsapp?s=${key}#log` : '/admin/whatsapp#log'} className={filter === key ? 'active' : ''}>
      {label}
      <span className="count">{key ? counts[key] || 0 : out.length}</span>
    </Link>
  );

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <div className="page-head">
        <div>
          <h1>Pengaturan WA</h1>
          <p>Status gateway WhatsApp, mode uji (DRY_RUN), kirim pesan tes, dan log pengiriman notifikasi.</p>
        </div>
        <div className="title-box" style={{ fontSize: 14 }}>
          {st.dryRun ? 'Mode uji: pesan hanya dicatat' : 'Mode kirim sungguhan'}
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="grid grid-2 stretch" style={{ paddingTop: 22, rowGap: 34 }}>
        <section className="mcard plain" style={{ ['--c' as string]: BOARD_COLORS[2] }}>
          <div className="tab">Status gateway</div>
          <dl className="kv" style={{ gridTemplateColumns: '150px minmax(0,1fr)' }}>
            <dt>Provider</dt>
            <dd>{st.provider}</dd>
            <dt>Alamat gateway</dt>
            <dd>{env.waApiUrl ? <code>{env.waApiUrl}</code> : <span className="badge red">WA_API_URL belum diisi</span>}</dd>
            <dt>API key / token</dt>
            <dd>{env.waToken ? <span className="badge green">Terisi</span> : <span className="badge red">WA_TOKEN belum diisi</span>}</dd>
            <dt>Koneksi WhatsApp</dt>
            <dd>
              {st.connected === null ? (
                <span className="badge outline">Tidak dicek</span>
              ) : st.connected ? (
                <span className="badge green">Tersambung</span>
              ) : (
                <span className="badge red">Terputus</span>
              )}{' '}
              {st.error ? <span className="subtle">{st.error}</span> : null}
            </dd>
            <dt>Nomor pengirim</dt>
            <dd>{st.phoneNumber || '-'}</dd>
            <dt>Uptime</dt>
            <dd>{st.uptime || '-'}</dd>
          </dl>
          <p className="subtle" style={{ marginBottom: 0 }}>
            API key dan alamat gateway disimpan sebagai Environment Variable di Vercel (<code>WA_API_URL</code>, <code>WA_TOKEN</code>), bukan di
            sheet, supaya tidak terbaca orang yang punya akses spreadsheet. Setelah mengubahnya, lakukan Redeploy. Webhook balasan:{' '}
            <code>{env.appUrl}/api/wa/webhook?key=…</code>
          </p>
        </section>

        <section className="mcard plain" style={{ ['--c' as string]: BOARD_COLORS[4] }}>
          <div className="tab">Mode pengiriman</div>
          <p style={{ marginTop: 0 }}>
            Sekarang: <b>{st.dryRun ? 'Mode uji (DRY_RUN)' : 'Kirim sungguhan'}</b> · {source}.
          </p>
          <p className="subtle">
            Mode uji mencatat pesan di Log_WA tanpa mengirimnya. Saat kirim sungguhan, pesan dikirim berurutan dengan jeda {env.waDelayMs / 1000}{' '}
            detik dan dicoba ulang otomatis maksimal {WA_MAX_TRIES}x bila gateway sedang bermasalah.
          </p>
          <form action={setWaModeAction} className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button name="mode" value="Tidak" className={`btn ${cfg === false ? 'primary' : ''}`}>
              Kirim sungguhan
            </button>
            <button name="mode" value="Ya" className={`btn ${cfg === true ? 'primary' : ''}`}>
              Mode uji (DRY_RUN)
            </button>
            <button name="mode" value="" className={`btn ${cfg === null ? 'primary' : ''}`}>
              Ikuti env Vercel
            </button>
          </form>
          {!st.dryRun && !st.configured ? (
            <p className="flash err" style={{ marginTop: 12 }}>
              Mode kirim aktif tetapi gateway belum lengkap: semua pesan akan tercatat Gagal.
            </p>
          ) : null}
        </section>

        <section className="mcard plain" id="tes" style={{ ['--c' as string]: BOARD_COLORS[6] }}>
          <div className="tab">Kirim pesan tes</div>
          <form action={testWaAction} className="form-grid" style={{ display: 'grid', gap: 10 }}>
            <div className="field">
              <label htmlFor="to">Nomor tujuan</label>
              <input id="to" name="to" inputMode="tel" placeholder="0812 3456 7890" required />
            </div>
            <div className="field">
              <label htmlFor="text">Pesan (opsional)</label>
              <textarea id="text" name="text" rows={2} placeholder="Tes dari Creative Request Tracker…" />
            </div>
            <div>
              <SubmitButton className="btn primary" pendingText="Mengirim…">
                Kirim tes
              </SubmitButton>
            </div>
          </form>
          <p className="subtle" style={{ marginBottom: 0 }}>
            Tes ke nomor anggota tertentu juga bisa dari tombol <b>Tes WA</b> di <Link href="/admin/users">Kelola user</Link>.
          </p>
        </section>

        <section className="mcard plain" style={{ ['--c' as string]: BOARD_COLORS[8] }}>
          <div className="tab">User tanpa No WA ({noPhone.length})</div>
          {noPhone.length === 0 ? (
            <p style={{ marginTop: 0 }}>Semua user aktif yang punya peran kerja sudah punya No WA.</p>
          ) : (
            <>
              <p className="subtle" style={{ marginTop: 0 }}>
                Mereka tidak menerima notifikasi WA (tercatat &quot;Dilewati&quot; di log). Isi dari Kelola user, atau minta mereka mengisi sendiri di
                halaman Akun.
              </p>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {noPhone.map(({ a }) => (
                  <li key={a.email}>
                    <Link href={`/admin/users?f=tanpa-wa#u-edit-${a.email.replace(/[^a-z0-9]/gi, '')}`}>{a.nama}</Link>{' '}
                    <span className="subtle">{a.email}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {people.length < db.accounts.filter((a) => a.aktif).length ? (
            <p className="subtle">
              {db.accounts.filter((a) => a.aktif).length - people.length} akun lain belum punya peran kerja sehingga tidak menerima notifikasi.
            </p>
          ) : null}
        </section>
      </div>

      <h2 className="section-title" id="log">
        Log pengiriman <span className="hint">· 60 pesan keluar terbaru</span>
      </h2>
      <div className="tabs">
        {tab('', 'Semua')}
        {tab('Terkirim', 'Terkirim')}
        {tab('Gagal', 'Gagal')}
        {tab('Dilewati', 'Dilewati (nomor kosong)')}
        {tab('DRY_RUN', 'DRY_RUN')}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Ke</th>
              <th>Jenis</th>
              <th>Ref</th>
              <th>Status</th>
              <th>Pesan</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="subtle">
                  Belum ada pesan.
                </td>
              </tr>
            ) : (
              logs.map((l, i) => {
                const status = waStatus(l.Hasil);
                return (
                  <tr key={i}>
                    <td className="nowrap">{l.Timestamp}</td>
                    <td>
                      {l.Nama || '-'}
                      <div className="subtle">{l.Nomor || 'nomor kosong'}</div>
                    </td>
                    <td>{l.Jenis}</td>
                    <td className="nowrap">{l['Ref ID']}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[status] || ''}`}>{status}</span>
                      {status === 'Gagal' || status === 'Dilewati' ? <div className="subtle">{l.Hasil.replace(/^(GAGAL|Gagal|Dilewati):\s*/, '')}</div> : null}
                    </td>
                    <td style={{ maxWidth: 380 }}>
                      <div className="subtle" style={{ whiteSpace: 'pre-wrap', maxHeight: 64, overflow: 'hidden' }}>
                        {l.Pesan}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
