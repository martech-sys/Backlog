'use client';

import { startTransition, useActionState } from 'react';
import { testWaInlineAction, type TestWaState } from '@/app/actions';

/** Tombol Tes WA per user: animasi saat mengirim, hasil tampil di bawahnya, maks. `limit`x per hari. */
export function TestWaButton({ to, nama, remaining, limit }: { to: string; nama: string; remaining: number; limit: number }) {
  const [state, action, pending] = useActionState(testWaInlineAction, {} as TestWaState);
  const left = state.remaining ?? remaining;
  return (
    <>
      <button
        type="button"
        className="btn small"
        disabled={pending || left <= 0}
        title={left <= 0 ? `Batas tes ${limit}x per hari sudah tercapai` : `Kirim pesan tes ke ${nama} (sisa ${left}x hari ini)`}
        onClick={() => {
          const fd = new FormData();
          fd.set('to', to);
          fd.set('nama', nama);
          startTransition(() => action(fd));
        }}
      >
        {pending ? (
          <>
            <span className="spinner" aria-hidden /> Mengirim…
          </>
        ) : left <= 0 ? (
          'Batas tes habis'
        ) : (
          'Tes WA'
        )}
      </button>
      {state.message ? (
        <span className={`cell-note ${state.ok ? 'ok' : 'err'}`} role="status">
          {state.ok ? '✓ ' : '✕ '}
          {state.message}
        </span>
      ) : null}
    </>
  );
}
