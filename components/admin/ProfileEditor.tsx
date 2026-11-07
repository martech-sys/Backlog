'use client';

import { useState } from 'react';
import { editProfileAction } from '@/app/actions';
import { SubmitButton } from '@/components/SubmitButton';
import type { WorkProfile } from '@/lib/people';
import { ProfileFields, type BrandOpt } from './ProfileFields';

/** Form ubah peran kerja, sisi, divisi, brand, No WA, dan nama untuk satu user. */
export function ProfileEditor({
  email,
  initial,
  brands,
  peranRequired,
}: {
  email: string;
  initial: WorkProfile;
  brands: BrandOpt[];
  peranRequired: boolean;
}) {
  const [profile, setProfile] = useState(initial);
  const idp = `edit-${email.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <form action={editProfileAction} className="stack" style={{ marginTop: 8, minWidth: 420 }}>
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="back" value={`/admin/users#u-${idp}`} />
      <div className="field">
        <label htmlFor={`${idp}-nama`}>Nama</label>
        <input id={`${idp}-nama`} name="nama" type="text" value={profile.nama} onChange={(e) => setProfile({ ...profile, nama: e.target.value })} />
      </div>
      <ProfileFields value={profile} onChange={setProfile} brands={brands} idPrefix={idp} peranRequired={peranRequired} />
      <div>
        <SubmitButton className="btn primary small">Simpan peran kerja</SubmitButton>
      </div>
    </form>
  );
}
