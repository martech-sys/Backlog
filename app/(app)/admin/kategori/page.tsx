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

export const metadata = { title: 'Manage categories' };

type SP = Promise<Record<string, string | undefined>>;

const divisiLabel = (v: string) => DIVISI.find((d) => d.value === v)?.label || v || '-';
const MODE_LABEL: Record<string, string> = { 'Lead pilih': 'Lead picks', 'Otomatis beban': 'Auto (least-loaded)', Default: 'Default' };

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
                Category name <span className="req">*</span>
              </label>
              <input id={p('name')} name="name" required maxLength={40} defaultValue={defaultName} placeholder="E.g. Marketplace banner" />
            </div>
            <div className="field">
              <label htmlFor={p('code')}>
                Task ID code <span className="req">*</span>
              </label>
              <input id={p('code')} name="code" required maxLength={4} pattern="[A-Za-z0-9]{1,4}" placeholder="E.g. BM" style={{ textTransform: 'uppercase' }} />
              <span className="help">1–4 letters/digits. Example ID: CR-2611-001-BM. Can't be changed after saving.</span>
            </div>
          </>
        ) : null}
        {isCustomCat ? null : (
          <div className="field">
            <label htmlFor={p('divisi')}>
              Division <span className="req">*</span>
            </label>
            <select id={p('divisi')} name="divisi" required defaultValue={rule?.divisi || ''}>
              <option value="">Choose a division…</option>
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
              <option value="">Automatic (division lead for the side)</option>
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
          <label htmlFor={p('mode')}>Assignment method</label>
          <select id={p('mode')} name="modeAssign" defaultValue={rule?.modeAssign || 'Lead pilih'}>
            {MODE_ASSIGN.map((m) => (
              <option key={m} value={m}>
                {m === 'Lead pilih' ? 'Lead picks a member' : m === 'Otomatis beban' ? 'Auto to least-loaded member' : 'Default to a specific person'}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={p('assignee')}>Default assignee</label>
          <select id={p('assignee')} name="assigneeDefault" defaultValue={rule?.assigneeDefault || ''}>
            <option value="">—</option>
            {members.map((x) => (
              <option key={x.name} value={x.name}>
                {x.name} · {divisiLabel(x.divisi)}
              </option>
            ))}
          </select>
          <span className="help">Used when the assignment method is Default.</span>
        </div>
        <div className="field">
          <label htmlFor={p('filter')}>Job title filter (auto-assign)</label>
          <input id={p('filter')} name="filterPeran" defaultValue={rule?.filterPeran || ''} placeholder="E.g. Photo Editor" />
          <span className="help">Empty = all division members.</span>
        </div>
        <div className="field">
          <label htmlFor={p('lt')}>Minimum lead time (working days)</label>
          <input id={p('lt')} name="leadTimeMin" type="number" min={0} max={60} required defaultValue={rule?.leadTimeMin ?? 3} />
        </div>
        <div className="field">
          <label htmlFor={p('buf')}>Review buffer (working days)</label>
          <input id={p('buf')} name="bufferReview" type="number" min={0} max={10} required defaultValue={rule?.bufferReview ?? 1} />
          <span className="help">Draft target = deadline minus this buffer.</span>
        </div>
      </div>
      {isCustomCat ? (
        <input type="hidden" name="subJenis" value="Custom" />
      ) : (
        <div className="field">
          <label htmlFor={p('sub')}>
            Sub-types <span className="req">*</span>
          </label>
          <input id={p('sub')} name="subJenis" required defaultValue={rule?.subJenis.join(', ') || ''} placeholder="Comma separated, e.g. Shopee, Tokopedia, TikTok Shop" />
        </div>
      )}
      <div className="field">
        <span className="label">Form fields on the request form</span>
        {builtIn ? (
          <p className="subtle" style={{ margin: 0 }}>
            Built-in category: its form fields are fixed ({fields.map((f) => f.label).join(', ') || '-'}) so old request data stays readable.
          </p>
        ) : (
          <FieldBuilder initial={fields} />
        )}
      </div>
      <label className="row" style={{ gap: 6, alignItems: 'center', justifyContent: 'flex-start' }}>
        <input type="checkbox" name="aktif" value="Ya" defaultChecked={rule ? rule.active : true} disabled={isCustomCat} style={{ flex: '0 0 auto', width: 'auto' }} />
        <span>Active (shown on the New request form and routed)</span>
        {isCustomCat ? <input type="hidden" name="aktif" value="Ya" /> : null}
      </label>
    </>
  );
}

export default async function KategoriPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  if (!canManageKategori(user)) redirect('/dashboard?err=' + encodeURIComponent('This page is for Admin/Superadmin only.'));
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
          <h1>Manage categories</h1>
          <p>Add new work categories with their form fields, change lead &amp; lead time, or deactivate a category. Changes apply right away.</p>
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} big />

      <h2 className="section-title" id="tambah">
        <span className="num">1</span> Add category
      </h2>
      <section className="mcard plain" style={{ ['--c' as string]: BOARD_COLORS[2], marginTop: 22 }}>
        <div className="tab">New category</div>
        <form action={saveKategoriAction} className="stack" key={sp.ok || 'baru'}>
          <input type="hidden" name="originalCode" value="" />
          <RuleFields isNew defaultName={sp.baru} leads={leads} members={members} fields={[]} builtIn={false} />
          <div>
            <SubmitButton>Add category</SubmitButton>
          </div>
        </form>
      </section>

      <h2 className="section-title" id="daftar">
        <span className="num">2</span> Category list
      </h2>
      <div className="kat-list">
        {db.master.kategori.map((r, i) => {
          const def = defs.find((d) => d.name === r.kategori);
          const builtIn = CATEGORIES.some((c) => c.name === r.kategori);
          return (
            <details key={`${r.code || r.kategori}-${i}`} id={`k-${r.code}`} className={`kat-item${r.active ? '' : ' off'}`} open={sp.buka === r.code}>
              <summary>
                <span className="kat-name">
                  <b>{r.kategori}</b> {builtIn ? <span className="badge outline">Built-in</span> : <span className="badge violet">Created on web</span>}{' '}
                  {r.active ? null : <span className="badge">Inactive</span>}
                  <span className="subtle">{r.subJenis.join(', ') || '-'}</span>
                </span>
                <span>
                  <span className="subtle">Code</span> {r.code || '-'}
                </span>
                <span>
                  <span className="subtle">Division</span> {divisiLabel(r.divisi)}
                </span>
                <span>
                  <span className="subtle">Lead</span> {r.leadMenswear || 'auto'} / {r.leadWomenswear || 'auto'}
                </span>
                <span>
                  <span className="subtle">Assign</span> {MODE_LABEL[r.modeAssign] || r.modeAssign}
                  {r.modeAssign === 'Default' && r.assigneeDefault ? ` (${r.assigneeDefault})` : ''}
                </span>
                <span>
                  <span className="subtle">Lead time</span> {r.leadTimeMin} days
                </span>
                <span>
                  <span className="subtle">Fields</span> {(def?.fields || []).length} fields · {used.get(r.kategori) || 0} tasks
                </span>
                <span className="btn small kat-toggle">Edit</span>
              </summary>
              <div className="kat-edit">
                {r.code ? (
                  <form action={saveKategoriAction} className="stack">
                    <input type="hidden" name="originalCode" value={r.code} />
                    <RuleFields rule={r} isNew={false} leads={leads} members={members} fields={def?.fields || []} builtIn={builtIn} />
                    <div>
                      <SubmitButton>Save {r.kategori}</SubmitButton>
                    </div>
                  </form>
                ) : (
                  <p className="subtle">This row has no Kode in the Master_Kategori sheet. Fill in the Kode column first to edit it here.</p>
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
