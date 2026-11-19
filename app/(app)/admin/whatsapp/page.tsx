import Link from 'next/link';
import { setWaModeAction, testWaAction } from '@/app/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { Flash } from '@/components/ui';
import { BOARD_COLORS } from '@/lib/backlog';
import { env } from '@/lib/env';
import { findPerson, findPersonByEmail } from '@/lib/master';
import { getDbWithWa, requireSuperadmin } from '@/lib/session';
import { gatewayStatus, waStatus, WA_MAX_TRIES } from '@/lib/wa';

export const metadata = { title: 'WhatsApp settings' };
export const maxDuration = 30;

type SP = Promise<Record<string, string | undefined>>;

const STATUS_BADGE: Record<string, string> = { Terkirim: 'green', Gagal: 'red', Dilewati: 'amber', DRY_RUN: 'outline', Masuk: 'blue' };
const STATUS_LABEL: Record<string, string> = { Terkirim: 'Sent', Gagal: 'Failed', Dilewati: 'Skipped', Masuk: 'Incoming' };

export default async function WhatsappPage({ searchParams }: { searchParams: SP }) {
  await requireSuperadmin();
  const sp = await searchParams;
  const db = await getDbWithWa();
  const cfg = db.master.config.waDryRun;
  const st = await gatewayStatus(cfg);
  const source = cfg === null ? 'following env WA_DRY_RUN in Vercel' : 'set from this page (Config tab)';

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
          <h1>WhatsApp settings</h1>
          <p>WhatsApp gateway status, test mode (DRY_RUN), test messages, and the notification send log.</p>
        </div>
        <div className="title-box" style={{ fontSize: 14 }}>
          {st.dryRun ? 'Test mode: messages are only logged' : 'Live sending'}
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="grid grid-2 stretch" style={{ paddingTop: 22, rowGap: 34 }}>
        <section className="mcard plain" style={{ ['--c' as string]: BOARD_COLORS[2] }}>
          <div className="tab">Gateway status</div>
          <dl className="kv" style={{ gridTemplateColumns: '150px minmax(0,1fr)' }}>
            <dt>Provider</dt>
            <dd>{st.provider}</dd>
            <dt>Gateway URL</dt>
            <dd>{env.waApiUrl ? <code>{env.waApiUrl}</code> : <span className="badge red">WA_API_URL not set</span>}</dd>
            <dt>API key / token</dt>
            <dd>{env.waToken ? <span className="badge green">Set</span> : <span className="badge red">WA_TOKEN not set</span>}</dd>
            <dt>WhatsApp connection</dt>
            <dd>
              {st.connected === null ? (
                <span className="badge outline">Not checked</span>
              ) : st.connected ? (
                <span className="badge green">Connected</span>
              ) : (
                <span className="badge red">Disconnected</span>
              )}{' '}
              {st.error ? <span className="subtle">{st.error}</span> : null}
            </dd>
            <dt>Sender number</dt>
            <dd>{st.phoneNumber || '-'}</dd>
            <dt>Uptime</dt>
            <dd>{st.uptime || '-'}</dd>
          </dl>
          <p className="subtle" style={{ marginBottom: 0 }}>
            The API key and gateway URL are stored as Environment Variables in Vercel (<code>WA_API_URL</code>, <code>WA_TOKEN</code>), not in
            the sheet, so people with spreadsheet access can't read them. Redeploy after changing them. Reply webhook:{' '}
            <code>{env.appUrl}/api/wa/webhook?key=…</code>
          </p>
        </section>

        <section className="mcard plain" style={{ ['--c' as string]: BOARD_COLORS[4] }}>
          <div className="tab">Sending mode</div>
          <p style={{ marginTop: 0 }}>
            Current: <b>{st.dryRun ? 'Test mode (DRY_RUN)' : 'Live sending'}</b> · {source}.
          </p>
          <p className="subtle">
            Test mode logs messages in Log_WA without sending them. In live sending, messages go out one by one with a {env.waDelayMs / 1000}{' '}
            second gap and are retried automatically up to {WA_MAX_TRIES}x if the gateway has problems.
          </p>
          <form action={setWaModeAction} className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button name="mode" value="Tidak" className={`btn ${cfg === false ? 'primary' : ''}`}>
              Live sending
            </button>
            <button name="mode" value="Ya" className={`btn ${cfg === true ? 'primary' : ''}`}>
              Test mode (DRY_RUN)
            </button>
            <button name="mode" value="" className={`btn ${cfg === null ? 'primary' : ''}`}>
              Follow Vercel env
            </button>
          </form>
          {!st.dryRun && !st.configured ? (
            <p className="flash err" style={{ marginTop: 12 }}>
              Live sending is on but the gateway isn't fully set up: every message will be logged as failed.
            </p>
          ) : null}
        </section>

        <section className="mcard plain" id="tes" style={{ ['--c' as string]: BOARD_COLORS[6] }}>
          <div className="tab">Send a test message</div>
          <p className="subtle" style={{ marginTop: 0 }}>
            Test messages are always actually sent, even in test mode. Task notifications follow the mode above.
          </p>
          <form action={testWaAction} className="form-grid" style={{ display: 'grid', gap: 10 }}>
            <div className="field">
              <label htmlFor="to">Recipient number</label>
              <input id="to" name="to" inputMode="tel" placeholder="0812 3456 7890" required />
            </div>
            <div className="field">
              <label htmlFor="text">Message (optional)</label>
              <textarea id="text" name="text" rows={2} placeholder="Tes dari Creative Request Tracker…" />
            </div>
            <div>
              <SubmitButton className="btn primary" pendingText="Sending…">
                Send test
              </SubmitButton>
            </div>
          </form>
          <p className="subtle" style={{ marginBottom: 0 }}>
            You can also test a specific member's number with the <b>Test WA</b> button in <Link href="/admin/users">Manage users</Link>.
          </p>
        </section>

        <section className="mcard plain" style={{ ['--c' as string]: BOARD_COLORS[8] }}>
          <div className="tab">Users without a WhatsApp number ({noPhone.length})</div>
          {noPhone.length === 0 ? (
            <p style={{ marginTop: 0 }}>Every active user with a work role has a WhatsApp number.</p>
          ) : (
            <>
              <p className="subtle" style={{ marginTop: 0 }}>
                They don't get WhatsApp notifications (logged as &quot;Skipped&quot;). Add numbers in Manage users, or ask them to fill it in
                themselves on the My account page.
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
              {db.accounts.filter((a) => a.aktif).length - people.length} other accounts have no work role yet, so they get no notifications.
            </p>
          ) : null}
        </section>
      </div>

      <h2 className="section-title" id="log">
        Send log <span className="hint">· latest 60 outgoing messages</span>
      </h2>
      <div className="tabs">
        {tab('', 'All')}
        {tab('Terkirim', 'Sent')}
        {tab('Gagal', 'Failed')}
        {tab('Dilewati', 'Skipped (no number)')}
        {tab('DRY_RUN', 'DRY_RUN')}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>To</th>
              <th>Type</th>
              <th>Ref</th>
              <th>Status</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="subtle">
                  No messages yet.
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
                      <div className="subtle">{l.Nomor || 'no number'}</div>
                    </td>
                    <td>{l.Jenis}</td>
                    <td className="nowrap">{l['Ref ID']}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[status] || ''}`}>{STATUS_LABEL[status] || status}</span>
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
