import { redirect } from 'next/navigation';
import { replaceLeadAction, saveKategoriAction } from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';
import { canReplaceLead } from '@/lib/leadAdmin';
import { DONE_STATUSES, type Status } from '@/lib/config';
import { FieldBuilder } from '@/components/admin/FieldBuilder';
import { SubmitButton } from '@/components/SubmitButton';
import { Flash } from '@/components/ui';
import { BOARD_COLORS } from '@/lib/backlog';
import { categoryDefs } from '@/lib/categories';
import { CATEGORIES, CUSTOM_CATEGORY, DIVISI, type CategoryField } from '@/lib/config';
import { canManageKategori, MODE_ASSIGN } from '@/lib/kategoriAdmin';
import type { KategoriRule, Person } from '@/lib/master';
import { getDb, requireUser } from '@/lib/session';

export const metadata = { title: 'Kelola kategori' };

type SP = Promise<Record<string, string | undefined>>;

const divisiLabel = (v: string) => DIVISI.find((d) => d.value === v)?.label || v || '-';

/** Field-field aturan kategori (dipakai di form tambah dan form ubah). */
function RuleFields({
  rule,
  isNew,
  defaultName,
  leads,
  members,
  fields,
  builtIn,
}: {
  rule?: KategoriRule;
  isNew: boolean;
  defaultName?: string;
  leads: Person[];
  members: Person[];
  fields: CategoryField[];
  builtIn: boolean;
}) {
  const p = (k: string) => `${rule?.code || 'baru'}-${k}`;
  const isCustomCat = rule?.kategori === CUSTOM_CATEGORY;
  return (
    <>
      <div className="form-grid">
        {isNew ? (
          <>
            <div className="field">
              <label htmlFor={p('name')}>
                Nama kategori <span className="req">*</span>
              </label>
              <input id={p('name')} name="name" required maxLength={40} defaultValue={defaultName} placeholder="Mis. Banner marketplace" />
            </div>
            <div className="field">
              <label htmlFor={p('code')}>
                Kode ID task <span className="req">*</span>
              </label>
              <input id={p('code')} name="code" required maxLength={4} pattern="[A-Za-z0-9]{1,4}" placeholder="Mis. BM" style={{ textTransform: 'uppercase' }} />
              <span className="help">1–4 huruf/angka. Contoh ID: CR-2611-001-BM. Tidak bisa diubah setelah disimpan.</span>
            </div>
          </>
        ) : null}
        {isCustomCat ? null : (
          <div className="field">
            <label htmlFor={p('divisi')}>
              Divisi <span className="req">*</span>
            </label>
            <select id={p('divisi')} name="divisi" required defaultValue={rule?.divisi || ''}>
              <option value="">Pilih divisi…</option>
              {DIVISI.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {(['leadMenswear', 'leadWomenswear'] as const).map((k) => (
          <div className="field" key={k}>
            <label htmlFor={p(k)}>Lead {k === 'leadMenswear' ? 'Menswear' : 'Womenswear'}</label>
            <select id={p(k)} name={k} defaultValue={rule ? rule[k] : ''}>
              <option value="">Otomatis (lead divisi sesuai sisi)</option>
              {leads.map((x) => (
                <option key={x.name} value={x.name}>
                  {x.name} · {divisiLabel(x.divisi)} · {x.grup}
                  {x.isLead ? ' · lead' : ''}
                </option>
              ))}
            </select>
          </div>
        ))}
        <div className="field">
          <label htmlFor={p('mode')}>Cara assign</label>
          <select id={p('mode')} name="modeAssign" defaultValue={rule?.modeAssign || 'Lead pilih'}>
            {MODE_ASSIGN.map((m) => (
              <option key={m} value={m}>
                {m === 'Lead pilih' ? 'Lead memilih anggota' : m === 'Otomatis beban' ? 'Otomatis ke anggota paling longgar' : 'Default ke orang tertentu'}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={p('assignee')}>Assignee default</label>
          <select id={p('assignee')} name="assigneeDefault" defaultValue={rule?.assigneeDefault || ''}>
            <option value="">—</option>
            {members.map((x) => (
              <option key={x.name} value={x.name}>
                {x.name} · {divisiLabel(x.divisi)}
              </option>
            ))}
          </select>
          <span className="help">Dipakai bila cara assign = Default.</span>
        </div>
        <div className="field">
          <label htmlFor={p('filter')}>Filter jabatan (otomatis beban)</label>
          <input id={p('filter')} name="filterPeran" defaultValue={rule?.filterPeran || ''} placeholder="Mis. Photo Editor" />
          <span className="help">Kosong = semua anggota divisi.</span>
        </div>
        <div className="field">
          <label htmlFor={p('lt')}>Lead time minimum (hari kerja)</label>
          <input id={p('lt')} name="leadTimeMin" type="number" min={0} max={60} required defaultValue={rule?.leadTimeMin ?? 3} />
        </div>
        <div className="field">
          <label htmlFor={p('buf')}>Buffer review (hari kerja)</label>
          <input id={p('buf')} name="bufferReview" type="number" min={0} max={10} required defaultValue={rule?.bufferReview ?? 1} />
          <span className="help">Target draft = deadline dikurangi buffer ini.</span>
        </div>
      </div>
      {isCustomCat ? (
        <input type="hidden" name="subJenis" value="Custom" />
      ) : (
        <div className="field">
          <label htmlFor={p('sub')}>
            Sub-jenis <span className="req">*</span>
          </label>
          <input id={p('sub')} name="subJenis" required defaultValue={rule?.subJenis.join(', ') || ''} placeholder="Pisahkan dengan koma, mis. Shopee, Tokopedia, TikTok Shop" />
        </div>
      )}
      <div className="field">
        <span className="label">Kolom isian di form request</span>
        {builtIn ? (
          <p className="subtle" style={{ margin: 0 }}>
            Kategori bawaan: kolom isiannya tetap ({fields.map((f) => f.label).join(', ') || '-'}) agar data request lama tetap terbaca.
          </p>
        ) : (
          <FieldBuilder initial={fields} />
        )}
      </div>
      <label className="row" style={{ gap: 6, alignItems: 'center', justifyContent: 'flex-start' }}>
        <input type="checkbox" name="aktif" value="Ya" defaultChecked={rule ? rule.active : true} disabled={isCustomCat} style={{ flex: '0 0 auto', width: 'auto' }} />
        <span>Aktif (muncul di form Request baru dan dirouting)</span>
        {isCustomCat ? <input type="hidden" name="aktif" value="Ya" /> : null}
      </label>
    </>
  );
}

export default async function KategoriPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  if (!canManageKategori(user)) redirect('/dashboard?err=' + encodeURIComponent('Halaman ini khusus Admin/Superadmin.'));
  const sp = await searchParams;
  const db = await getDb();
  const defs = categoryDefs(db.master, { includeInactive: true });
  // Dropdown lead berisi semua anggota tim aktif (tanpa filter divisi/peran), lead lebih dulu.
  const leads = db.master.people
    .filter((p) => p.active && p.sources.includes('tim'))
    .sort((a, b) => Number(b.isLead) - Number(a.isLead) || a.name.localeCompare(b.name));
  const members = db.master.people
    .filter((p) => p.active && p.sources.includes('tim'))
    .sort((a, b) => a.name.localeCompare(b.name));
  const used = new Map<string, number>();
  for (const t of db.tasks) used.set(t.Kategori, (used.get(t.Kategori) || 0) + 1);
  // Ganti lead: siapa pun yang saat ini lead (peran, task aktif, atau aturan kategori).
  const leadTasks = new Map<string, number>();
  for (const t of db.tasks) if (t.Lead && !DONE_STATUSES.includes(t.Status as Status)) leadTasks.set(t.Lead, (leadTasks.get(t.Lead) || 0) + 1);
  const leadRules = new Map<string, number>();
  for (const k of db.master.kategori)
    for (const n of new Set([k.leadMenswear, k.leadWomenswear].filter(Boolean))) leadRules.set(n, (leadRules.get(n) || 0) + 1);
  const currentLeads = [
    ...new Set([...db.master.people.filter((p) => p.isLead).map((p) => p.name), ...leadTasks.keys(), ...leadRules.keys()]),
  ].sort((a, b) => a.localeCompare(b));
  const mayReplace = canReplaceLead(user);

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <div className="page-head">
        <div>
          <h1>Kelola kategori</h1>
          <p>Tambah kategori pekerjaan baru beserta kolom isian form-nya, ubah lead &amp; lead time, atau nonaktifkan kategori. Perubahan langsung berlaku.</p>
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} big />

      <h2 className="section-title" id="tambah">
        <span className="num">1</span> Tambah kategori
      </h2>
      <section className="mcard plain" style={{ ['--c' as string]: BOARD_COLORS[2], marginTop: 22 }}>
        <div className="tab">Kategori baru</div>
        <form action={saveKategoriAction} className="stack" key={sp.ok || 'baru'}>
          <input type="hidden" name="originalCode" value="" />
          <RuleFields isNew defaultName={sp.baru} leads={leads} members={members} fields={[]} builtIn={false} />
          <div>
            <SubmitButton>Tambah kategori</SubmitButton>
          </div>
        </form>
      </section>

      <h2 className="section-title" id="daftar">
        <span className="num">2</span> Daftar kategori
      </h2>
      <div className="kat-list">
        {db.master.kategori.map((r, i) => {
          const def = defs.find((d) => d.name === r.kategori);
          const builtIn = CATEGORIES.some((c) => c.name === r.kategori);
          return (
            <details key={`${r.code || r.kategori}-${i}`} id={`k-${r.code}`} className={`kat-item${r.active ? '' : ' off'}`} open={sp.buka === r.code}>
              <summary>
                <span className="kat-name">
                  <b>{r.kategori}</b> {builtIn ? <span className="badge outline">Bawaan</span> : <span className="badge violet">Buatan web</span>}{' '}
                  {r.active ? null : <span className="badge">Nonaktif</span>}
                  <span className="subtle">{r.subJenis.join(', ') || '-'}</span>
                </span>
                <span>
                  <span className="subtle">Kode</span> {r.code || '-'}
                </span>
                <span>
                  <span className="subtle">Divisi</span> {divisiLabel(r.divisi)}
                </span>
                <span>
                  <span className="subtle">Lead</span> {r.leadMenswear || 'otomatis'} / {r.leadWomenswear || 'otomatis'}
                </span>
                <span>
                  <span className="subtle">Assign</span> {r.modeAssign}
                  {r.modeAssign === 'Default' && r.assigneeDefault ? ` (${r.assigneeDefault})` : ''}
                </span>
                <span>
                  <span className="subtle">Lead time</span> {r.leadTimeMin} hari
                </span>
                <span>
                  <span className="subtle">Isian</span> {(def?.fields || []).length} kolom · {used.get(r.kategori) || 0} task
                </span>
                <span className="btn small kat-toggle">Ubah</span>
              </summary>
              <div className="kat-edit">
                {r.code ? (
                  <form action={saveKategoriAction} className="stack">
                    <input type="hidden" name="originalCode" value={r.code} />
                    <RuleFields rule={r} isNew={false} leads={leads} members={members} fields={def?.fields || []} builtIn={builtIn} />
                    <div>
                      <SubmitButton>Simpan {r.kategori}</SubmitButton>
                    </div>
                  </form>
                ) : (
                  <p className="subtle">Baris ini belum punya Kode di sheet Master_Kategori. Isi kolom Kode dulu agar bisa diubah dari sini.</p>
                )}
              </div>
            </details>
          );
        })}
      </div>

      {mayReplace ? (
        <>
          <h2 className="section-title" id="ganti-lead">
            <span className="num">3</span> Replace a lead
          </h2>
          <section className="mcard plain">
            <p className="card-sub" style={{ marginTop: 0 }}>
              Moves every active task led by this person to the replacement, updates the category rules above, and (optionally) removes
              their lead role. The replacement is marked as a lead. Every change is logged and the new lead gets one WhatsApp summary.
            </p>
            <form action={replaceLeadAction} className="stack">
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="rl-from">Current lead</label>
                  <select id="rl-from" name="from" required defaultValue="">
                    <option value="" disabled>
                      Choose a lead…
                    </option>
                    {currentLeads.map((n) => (
                      <option key={n} value={n}>
                        {n} · {leadTasks.get(n) || 0} active tasks · {leadRules.get(n) || 0} category rules
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="rl-to">Replacement</label>
                  <select id="rl-to" name="to" required defaultValue="">
                    <option value="" disabled>
                      Choose anyone on the team…
                    </option>
                    {members.map((x) => (
                      <option key={x.name} value={x.name}>
                        {x.name} · {divisiLabel(x.divisi)} · {x.grup}
                        {x.isLead ? ' · lead' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="choice" style={{ alignSelf: 'flex-start' }}>
                <input type="checkbox" name="removeRole" value="Ya" defaultChecked /> Remove the lead role from the current lead
              </label>
              <div>
                <ConfirmButton className="btn primary" confirm="Replace this lead? Active tasks and category rules will move to the replacement.">
                  Replace lead
                </ConfirmButton>
              </div>
            </form>
          </section>
        </>
      ) : null}
    </div>
  );
}
