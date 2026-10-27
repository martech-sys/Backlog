'use client';

import { startTransition, useActionState } from 'react';
import { loginAction, type FormState } from '@/app/actions';
import { PasswordInput } from '@/components/PasswordInput';

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, {} as FormState);
  return (
    <form
      className="stack"
      // Tanpa reset otomatis agar isian tidak hilang saat ada error
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }} style={{ marginTop: 14 }}>
      {state.message ? <div className="flash err">{state.message}</div> : null}
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <PasswordInput id="password" name="password" autoComplete="current-password" />
      </div>
      <button type="submit" className="btn primary block" disabled={pending} style={{ padding: '10px 14px' }}>
        {pending ? 'Memeriksa…' : 'Masuk'}
      </button>
    </form>
  );
}
