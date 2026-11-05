'use client';

import { startTransition, useActionState } from 'react';
import { blastInvitesAction, resendInviteAction, type AdminState } from '@/app/actions';
import { InviteLinks } from './InviteLinks';

/** Kirim ulang undangan untuk satu user; menampilkan link bila email belum terkirim. */
export function InviteButton({ email, nama, label = 'Kirim ulang undangan' }: { email: string; nama: string; label?: string }) {
  const [state, action, pending] = useActionState(resendInviteAction, {} as AdminState);
  return (
    <div>
      <button
        type="button"
        className="btn small"
        disabled={pending}
        onClick={() => {
          const fd = new FormData();
          fd.set('email', email);
          fd.set('nama', nama);
          startTransition(() => action(fd));
        }}
      >
        {pending ? 'Mengirim…' : label}
      </button>
      {state.message ? <div className={`subtle`} style={{ marginTop: 4, color: state.ok ? 'var(--success)' : 'var(--warning)' }}>{state.message}</div> : null}
      {state.links?.length && !state.ok ? <InviteLinks links={state.links} /> : null}
    </div>
  );
}

/** Kirim undangan ke semua akun yang belum pernah login. */
export function BlastInvitesButton({ count }: { count: number }) {
  const [state, action, pending] = useActionState(blastInvitesAction, {} as AdminState);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div>
        <button
          type="button"
          className="btn"
          disabled={pending || count === 0}
          onClick={() => {
            if (window.confirm(`Kirim email undangan ke ${count} akun yang belum pernah login?`)) startTransition(() => action());
          }}
        >
          {pending ? 'Mengirim undangan…' : `Kirim undangan ke semua yang belum login (${count})`}
        </button>
      </div>
      {state.message ? <div className={`flash ${state.ok ? 'ok' : 'err'}`}>{state.message}</div> : null}
      {state.links?.length ? <InviteLinks links={state.links} /> : null}
    </div>
  );
}
