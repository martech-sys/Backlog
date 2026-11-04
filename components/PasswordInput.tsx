'use client';

import { useEffect, useState } from 'react';

const LETTERS = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';

function randomPassword(): string {
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  const pick = (set: string, from: number, n: number) =>
    Array.from(buf.slice(from, from + n), (x) => set[x % set.length]).join('');
  return `${pick(LETTERS, 0, 3)}${pick(DIGITS, 3, 4)}${pick(LETTERS, 7, 3)}`;
}

/** Input password dengan tombol tampilkan/sembunyikan dan (opsional) tombol buat password acak. */
export function PasswordInput({
  name,
  id,
  generate,
  autoGenerate,
  autoComplete = 'new-password',
  placeholder,
  required = true,
}: {
  name: string;
  id?: string;
  generate?: boolean;
  autoGenerate?: boolean;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(!!generate);
  useEffect(() => {
    if (autoGenerate) setValue(randomPassword());
  }, [autoGenerate]);

  return (
    <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
      <input
        id={id}
        name={name}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        minLength={8}
        spellCheck={false}
        style={{ fontFamily: show ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined }}
      />
      <button type="button" className="btn small" onClick={() => setShow((v) => !v)} aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'}>
        {show ? 'Sembunyi' : 'Lihat'}
      </button>
      {generate ? (
        <button
          type="button"
          className="btn small"
          onClick={() => {
            setValue(randomPassword());
            setShow(true);
          }}
        >
          Acak
        </button>
      ) : null}
    </div>
  );
}
