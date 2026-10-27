'use client';

import { startTransition, useActionState } from 'react';
import { changePasswordAction, type FormState } from '@/app/actions';
import { PasswordInput } from '@/components/PasswordInput';

export function ChangePasswordForm({ currentLabel }: { currentLabel: string }) {
  const [state, action, pending] = useActionState(changePasswordAction, {} as FormState);
  return (
    <form
      className="stack"
      // Tanpa reset otomatis agar isian tidak hilang saat ada error
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}>
      {state.message ? <div className={`flash ${state.ok ? 'ok' : 'err'}`}>{state.message}</div> : null}
      <div className="field">
        <label htmlFor="current">{currentLabel}</label>
        <PasswordInput id="current" name="current" autoComplete="current-password" />
      </div>
      <div className="field">
        <label htmlFor="password">Password baru</label>
        <PasswordInput id="password" name="password" />
        <span className="help">Minimal 8 karakter, berisi huruf dan angka.</span>
      </div>
      <div className="field">
        <label htmlFor="confirm">Ulangi password baru</label>
        <PasswordInput id="confirm" name="confirm" />
      </div>
      <div>
        <button type="submit" className="btn primary" disabled={pending}>
          {pending ? 'Menyimpan…' : 'Simpan password'}
        </button>
      </div>
    </form>
  );
}
