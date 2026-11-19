'use client';

import { useFormStatus } from 'react-dom';

/** Tombol submit yang meminta konfirmasi dulu (mis. hapus task). */
export function ConfirmButton({
  children,
  confirm,
  className = 'btn danger',
  title,
}: {
  children: React.ReactNode;
  confirm: string;
  className?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      title={title}
      aria-label={title}
      onClick={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? <span className="spinner" aria-hidden /> : children}
    </button>
  );
}
