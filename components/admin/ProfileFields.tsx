'use client';

import { DIVISI, PERAN, PERAN_DENGAN_DIVISI, PERAN_LIST, SISI, type Peran } from '@/lib/config';
import type { WorkProfile } from '@/lib/people';

export interface BrandOpt {
  name: string;
  grup: string;
}

/**
 * Isian peran kerja (dipakai di Tambah user dan Ubah user — satu sumber pilihan).
 * Divisi muncul untuk Lead/Staff/Intern, pilihan brand untuk PIC brand.
 */
export function ProfileFields({
  value,
  onChange,
  brands,
  idPrefix,
  peranRequired,
}: {
  value: WorkProfile;
  onChange: (v: WorkProfile) => void;
  brands: BrandOpt[];
  idPrefix: string;
  peranRequired?: boolean;
}) {
  const set = (patch: Partial<WorkProfile>) => onChange({ ...value, ...patch });
  const needsDivisi = PERAN_DENGAN_DIVISI.includes(value.peran as Peran);
  const isPic = value.peran === PERAN.PIC;
  const id = (k: string) => `${idPrefix}-${k}`;
  const brandGroups = ['Menswear', 'Womenswear'].map((g) => ({ g, items: brands.filter((b) => b.grup === g) }));

  return (
    <div className="form-grid">
      <div className="field">
        <label htmlFor={id('peran')}>
          Work role{peranRequired ? <span className="req"> *</span> : null}
        </label>
        <select id={id('peran')} name="peran" value={value.peran} onChange={(e) => set({ peran: e.target.value as WorkProfile['peran'] })}>
          <option value="">{peranRequired ? 'Choose a role…' : '(no work role)'}</option>
          {PERAN_LIST.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <span className="help">Decides task routing & WhatsApp notifications.</span>
      </div>
      <div className="field">
        <label htmlFor={id('sisi')}>Side</label>
        <select id={id('sisi')} name="sisi" value={value.sisi} onChange={(e) => set({ sisi: e.target.value })}>
          {SISI.map((x) => (
            <option key={x} value={x}>
              {x === 'Semua' ? 'All' : x}
            </option>
          ))}
        </select>
      </div>
      {needsDivisi ? (
        <>
          <div className="field">
            <label htmlFor={id('divisi')}>
              Division <span className="req">*</span>
            </label>
            <select id={id('divisi')} name="divisi" value={value.divisi} onChange={(e) => set({ divisi: e.target.value })}>
              <option value="">Choose a division…</option>
              {DIVISI.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={id('jabatan')}>Job title (optional)</label>
            <input
              id={id('jabatan')}
              name="jabatan"
              type="text"
              value={value.jabatan}
              onChange={(e) => set({ jabatan: e.target.value })}
              placeholder="e.g. Photo Editor, Graphic Designer"
            />
            <span className="help">Photo editing goes automatically to members titled &quot;Photo Editor&quot;.</span>
          </div>
        </>
      ) : (
        <input type="hidden" name="divisi" value="" />
      )}
      {isPic ? (
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <span className="label">Brands handled</span>
          {brandGroups.map(({ g, items }) => (
            <div key={g} className="choice-group" style={{ marginTop: 4 }}>
              <span className="subtle" style={{ alignSelf: 'center', minWidth: 90 }}>
                {g}
              </span>
              {items.map((b) => (
                <label key={b.name} className="choice">
                  <input
                    type="checkbox"
                    name="brand"
                    value={b.name}
                    checked={value.brands.includes(b.name)}
                    onChange={(e) =>
                      set({ brands: e.target.checked ? [...value.brands, b.name] : value.brands.filter((x) => x !== b.name) })
                    }
                  />
                  {b.name}
                </label>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      <div className="field">
        <label htmlFor={id('phone')}>WhatsApp number</label>
        <input
          id={id('phone')}
          name="phone"
          type="text"
          inputMode="tel"
          value={value.phone}
          onChange={(e) => set({ phone: e.target.value })}
          placeholder="08123456789"
        />
        <span className="help">Automatically formatted as 628…</span>
      </div>
      {needsDivisi ? (
        <div className="field">
          <label htmlFor={id('kapasitas')}>Active task capacity</label>
          <input
            id={id('kapasitas')}
            name="kapasitas"
            type="number"
            min={1}
            value={value.kapasitas}
            onChange={(e) => set({ kapasitas: e.target.value })}
            placeholder="5"
          />
        </div>
      ) : null}
    </div>
  );
}
