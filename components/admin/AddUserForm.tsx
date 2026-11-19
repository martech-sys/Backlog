'use client';

import { startTransition, useActionState, useState } from 'react';
import { createUserAction, type AdminState } from '@/app/actions';
import { PasswordInput } from '@/components/PasswordInput';
import { AKSES } from '@/lib/config';
import type { WorkProfile } from '@/lib/people';
import { InviteLinks } from './InviteLinks';
import { ProfileFields, type BrandOpt } from './ProfileFields';

const EMPTY: WorkProfile = { nama: '', peran: '', sisi: 'Semua', divisi: '', jabatan: '', brands: [], phone: '', kapasitas: '' };

export function AddUserForm({
  brands,
  suggestions,
}: {
  brands: BrandOpt[];
  /** Orang di master data: dipakai untuk isi otomatis bila nama cocok. */
  suggestions: { nama: string; email: string; profile: WorkProfile }[];
}) {
  const [state, action, pending] = useActionState(createUserAction, {} as AdminState);
  const [email, setEmail] = useState('');
  const [akses, setAkses] = useState<string>(AKSES.USER);
  const [profile, setProfile] = useState<WorkProfile>(EMPTY);
  const [showPassword, setShowPassword] = useState(false);

  const onName = (nama: string) => {
    const hit = suggestions.find((x) => x.nama.toLowerCase() === nama.trim().toLowerCase());
    if (hit) {
      setProfile({ ...hit.profile, nama: hit.nama });
      if (!email && hit.email) setEmail(hit.email);
    } else {
      setProfile({ ...profile, nama });
    }
  };

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
    >
      {state.message ? <div className={`flash ${state.ok ? 'ok' : 'err'}`}>{state.message}</div> : null}
      {state.links?.length ? <InviteLinks links={state.links} /> : null}
      <datalist id="master-names">
        {suggestions.map((x) => (
          <option key={x.nama} value={x.nama} />
        ))}
      </datalist>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="new-email">
            Email <span className="req">*</span>
          </label>
          <input id="new-email" name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@heymale.id" autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="new-nama">
            Name <span className="req">*</span>
          </label>
          <input id="new-nama" name="nama" type="text" required list="master-names" value={profile.nama} onChange={(e) => onName(e.target.value)} placeholder="Full name" autoComplete="off" />
          <span className="help">If the name is in master data, role & WhatsApp number fill in automatically (still editable).</span>
        </div>
        <div className="field">
          <label htmlFor="new-akses">Access (which menus they can open)</label>
          <select id="new-akses" name="akses" value={akses} onChange={(e) => setAkses(e.target.value)}>
            <option value={AKSES.USER}>User: based on work role</option>
            <option value={AKSES.ADMIN}>Admin: all actions + status fixes</option>
            <option value={AKSES.SUPERADMIN}>Superadmin: admin + manage users</option>
          </select>
        </div>
      </div>
      <ProfileFields value={profile} onChange={setProfile} brands={brands} idPrefix="new" peranRequired={akses === AKSES.USER} />
      <details open={showPassword} onToggle={(e) => setShowPassword((e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="subtle" style={{ cursor: 'pointer' }}>
          Fallback: set an initial password (if the invitation email can't be used)
        </summary>
        <div className="form-grid" style={{ marginTop: 8 }}>
          <div className="field">
            <label htmlFor="new-pass">Initial password</label>
            <PasswordInput id="new-pass" name="password" generate required={false} />
          </div>
          <label className="choice" style={{ alignSelf: 'end' }}>
            <input type="checkbox" name="mustChange" value="Ya" defaultChecked /> Must change password at first login
          </label>
        </div>
      </details>
      <div className="row">
        <span className="subtle">After you click Add user, an invitation email with a &quot;Set password&quot; button is sent automatically.</span>
        <span className="spacer" />
        <button type="submit" className="btn primary" disabled={pending}>
          {pending ? 'Saving…' : 'Add user & send invitation'}
        </button>
      </div>
    </form>
  );
}
