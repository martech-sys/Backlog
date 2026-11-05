'use client';

import { startTransition, useActionState } from 'react';
import { acceptInviteAction, type FormState } from '@/app/actions';
import { PasswordInput } from '@/components/PasswordInput';

export function InviteForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(acceptInviteAction, {} as FormState);
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
    >
      {state.message ? <div className="flash err">{state.message}</div> : null}
      <input type="hidden" name="token" value={token} />
      <input type="email" name="username" value={email} readOnly autoComplete="username" hidden />
      <div className="field">
        <label htmlFor="password">Password baru</label>
        <PasswordInput id="password" name="password" />
        <span className="help">Minimal 8 karakter, berisi huruf dan angka.</span>
      </div>
      <div className="field">
        <label htmlFor="confirm">Ulangi password</label>
        <PasswordInput id="confirm" name="confirm" />
      </div>
      <button type="submit" className="btn primary block" disabled={pending} style={{ padding: '10px 14px' }}>
        {pending ? 'Menyimpan…' : 'Simpan password & masuk'}
      </button>
    </form>
  );
}
