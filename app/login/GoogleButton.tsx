'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';

export function GoogleButton({ callbackUrl }: { callbackUrl: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn primary block"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signIn('google', { callbackUrl });
      }}
      style={{ padding: '10px 14px' }}
    >
      {busy ? 'Mengalihkan…' : 'Masuk dengan Google'}
    </button>
  );
}
