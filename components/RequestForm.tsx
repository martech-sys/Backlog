'use client';

import { startTransition, useActionState, useEffect, useMemo, useState } from 'react';
import type { FormState } from '@/app/actions';
import { CAMPAIGN_TYPES, CATEGORIES, type CategoryField } from '@/lib/config';
import type { RequestFormDefaults } from '@/lib/requestForm';
import { Field } from './ui';

interface Props {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  brands: { name: string; grup: string }[];
  pics: { name: string; grup: string }[];
  /** Traffic/admin boleh memilih PIC; PIC brand otomatis dirinya sendiri. */
  choosePic: boolean;
  currentUser: string;
  defaults: RequestFormDefaults;
  lockBrand?: boolean;
  today: string;
  submitLabel: string;
  leadTimes: Record<string, number>;
}

function workingDaysUntil(today: string, due: string): number {
  if (!due || due < today) return -1;
  let n = 0;
  const d = new Date(`${today}T00:00:00Z`);
  const end = new Date(`${due}T00:00:00Z`);
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

export function RequestForm(p: Props) {
  const [state, formAction, pending] = useActionState(p.action, {} as FormState);
  const [brand, setBrand] = useState(p.defaults.brand);
  const [kategori, setKategori] = useState<string[]>(p.defaults.kategori);
  const [due, setDue] = useState(p.defaults.dueDate);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  useEffect(() => setTouched(new Set()), [state]);
  // Error dari server disembunyikan begitu field-nya diubah.
  const e = Object.fromEntries(Object.entries(state.errors || {}).filter(([k]) => !touched.has(k)));

  const grup = p.brands.find((b) => b.name === brand)?.grup || '';
  const picOptions = p.pics.filter((x) => !grup || x.grup === grup);
  const leadTime = useMemo(() => Math.max(0, ...kategori.map((k) => p.leadTimes[k] || 0)), [kategori, p.leadTimes]);
  const daysLeft = due ? workingDaysUntil(p.today, due) : null;
  const urgent = daysLeft !== null && daysLeft >= 0 && kategori.length > 0 && daysLeft < leadTime;

  const toggle = (k: string) => setKategori((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  const renderField = (k: string, f: CategoryField) => {
    const name = `detail:${k}:${f.key}`;
    const dv = p.defaults.details[k]?.[f.key] || '';
    const id = `${k}-${f.key}`.replace(/[^a-z0-9-]/gi, '_');
    let input: React.ReactNode;
    if (f.type === 'select') {
      input = (
        <select id={id} name={name} defaultValue={dv}>
          <option value="">Pilih…</option>
          {f.options!.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    } else if (f.type === 'textarea') {
      input = <textarea id={id} name={name} defaultValue={dv} placeholder={f.placeholder} />;
    } else {
      input = (
        <input
          id={id}
          name={name}
          type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
          min={f.type === 'number' ? 1 : undefined}
          defaultValue={dv}
          placeholder={f.placeholder}
        />
      );
    }
    return (
      <Field key={f.key} label={f.label} required={f.required} error={e[`detail:${k}:${f.key}`]} htmlFor={id}>
        {input}
      </Field>
    );
  };

  return (
    <form
      onChange={(ev) => {
        const name = (ev.target as unknown as { name?: string }).name;
        if (name && state.errors?.[name] && !touched.has(name)) setTouched((cur) => new Set(cur).add(name));
      }}
      onSubmit={(ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.currentTarget);
        startTransition(() => formAction(fd));
      }}
      noValidate
    >
      {state.message && !state.ok ? <div className="flash err">{state.message}</div> : null}

      <div className="form-section">
        <h2 className="section-title">
          <span className="num">1</span> Campaign
        </h2>
        <div className="form-grid">
          <Field label="Brand Name" required error={e.brand} htmlFor="brand">
            <select
              id="brand"
              name="brand"
              value={brand}
              onChange={(ev) => setBrand(ev.target.value)}
              disabled={p.lockBrand}
            >
              <option value="">Pilih brand…</option>
              {['Menswear', 'Womenswear'].map((g) => (
                <optgroup key={g} label={g}>
                  {p.brands
                    .filter((b) => b.grup === g)
                    .map((b) => (
                      <option key={b.name}>{b.name}</option>
                    ))}
                </optgroup>
              ))}
            </select>
            {p.lockBrand ? <input type="hidden" name="brand" value={brand} /> : null}
          </Field>
          {p.choosePic ? (
            <Field label="PIC Brand (requestor)" required error={e.picName} htmlFor="picName">
              <select id="picName" name="picName" defaultValue={p.defaults.picName}>
                <option value="">Pilih PIC…</option>
                {picOptions.map((x) => (
                  <option key={x.name}>{x.name}</option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Requestor" htmlFor="requestor">
              <input id="requestor" type="text" value={p.currentUser} disabled />
            </Field>
          )}
          <Field label="Campaign Name" required error={e.campaignName} htmlFor="campaignName">
            <input id="campaignName" name="campaignName" type="text" defaultValue={p.defaults.campaignName} />
          </Field>
          <Field label="Campaign Type" required help="Tipe campaign diklasifikasi berdasarkan budget" error={e.campaignType} htmlFor="campaignType">
            <select id="campaignType" name="campaignType" defaultValue={p.defaults.campaignType}>
              <option value="">Pilih…</option>
              {CAMPAIGN_TYPES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Objective" required help="Tujuan utama dari campaign" error={e.objective} htmlFor="objective">
          <textarea id="objective" name="objective" defaultValue={p.defaults.objective} />
        </Field>
      </div>

      <div className="form-section">
        <h2 className="section-title">
          <span className="num">2</span> Kategori pekerjaan
          <span className="hint">· boleh lebih dari satu, tiap kategori jadi task di divisinya</span>
        </h2>
        <div className={`field${e.kategori ? ' invalid' : ''}`}>
          <div className="choice-group" role="group" aria-label="Kategori">
            {CATEGORIES.map((c) => (
              <label className="choice" key={c.name}>
                <input type="checkbox" name="kategori" value={c.name} checked={kategori.includes(c.name)} onChange={() => toggle(c.name)} />
                {c.name}
              </label>
            ))}
          </div>
          {e.kategori ? <span className="error">{e.kategori}</span> : null}
        </div>

        {CATEGORIES.filter((c) => kategori.includes(c.name)).map((c) => (
          <div className="kat-block" key={c.name}>
            <h3>
              {c.name}{' '}
              <span className="subtle">· lead time minimum {p.leadTimes[c.name] ?? '-'} hari kerja</span>
            </h3>
            <div className={`field${e[`sub:${c.name}`] ? ' invalid' : ''}`}>
              <span className="label">
                Sub-jenis <span className="req">*</span>
              </span>
              <div className="choice-group">
                {c.subTypes.map((s) => (
                  <label className="choice" key={s}>
                    <input type="checkbox" name={`sub:${c.name}`} value={s} defaultChecked={p.defaults.subJenis[c.name]?.includes(s)} />
                    {s}
                  </label>
                ))}
              </div>
              {e[`sub:${c.name}`] ? <span className="error">{e[`sub:${c.name}`]}</span> : null}
            </div>
            <div className="form-grid">{c.fields.map((f) => renderField(c.name, f))}</div>
          </div>
        ))}
      </div>

      <div className="form-section">
        <h2 className="section-title">
          <span className="num">3</span> Brief kreatif
        </h2>
        <Field label="Product Knowledge/USP" required help="Keunggulan utama produk" error={e.usp} htmlFor="usp">
          <textarea id="usp" name="usp" defaultValue={p.defaults.usp} />
        </Field>
        <Field label="Key Message" required error={e.keyMessage} htmlFor="keyMessage">
          <textarea id="keyMessage" name="keyMessage" defaultValue={p.defaults.keyMessage} />
        </Field>
        <Field label="Creative Note" required help="Mood, suasana, atau situasi visual yang diinginkan" error={e.creativeNote} htmlFor="creativeNote">
          <textarea id="creativeNote" name="creativeNote" defaultValue={p.defaults.creativeNote} />
        </Field>
        <div className="form-grid">
          <Field label="Target Audience" required error={e.targetAudience} htmlFor="targetAudience">
            <input id="targetAudience" name="targetAudience" type="text" defaultValue={p.defaults.targetAudience} />
          </Field>
          <Field label="Budget (Rp)" required error={e.budget} htmlFor="budget">
            <input id="budget" name="budget" type="text" inputMode="numeric" placeholder="Rp" defaultValue={p.defaults.budget} />
          </Field>
        </div>
      </div>

      <div className="form-section">
        <h2 className="section-title">
          <span className="num">4</span> Deadline & output
        </h2>
        <div className="form-grid">
          <Field label="Due Date" required help="Isi dengan tanggal OPOR atau tanggal campaign" error={e.dueDate} htmlFor="dueDate">
            <input id="dueDate" name="dueDate" type="date" min={p.today} value={due} onChange={(ev) => setDue(ev.target.value)} />
            {urgent ? (
              <span className="badge red" style={{ alignSelf: 'flex-start' }}>
                URGENT: sisa {daysLeft} hari kerja, lead time minimum {leadTime} hari kerja
              </span>
            ) : null}
          </Field>
          <Field label="Deliverables" required error={e.deliverables} htmlFor="deliverables">
            <input
              id="deliverables"
              name="deliverables"
              type="text"
              placeholder="e.g. Reels (3 videos), Editorial Photos (8 images), Website Banner (2 images)"
              defaultValue={p.defaults.deliverables}
            />
          </Field>
          <Field label="Supporting Link" error={e.supportingLink} htmlFor="supportingLink">
            <input id="supportingLink" name="supportingLink" type="url" placeholder="https://" defaultValue={p.defaults.supportingLink} />
          </Field>
          <Field label="Attachments" help="Link Google Drive berisi lampiran (referensi, produk, logo)" htmlFor="attachments">
            <input id="attachments" name="attachments" type="text" placeholder="https://drive.google.com/…" defaultValue={p.defaults.attachments} />
          </Field>
        </div>
      </div>

      <div className="form-section">
        <button type="submit" className="btn primary block" disabled={pending} style={{ padding: '12px 16px', fontSize: 15 }}>
          {pending ? 'Mengirim…' : p.submitLabel}
        </button>
      </div>
    </form>
  );
}
