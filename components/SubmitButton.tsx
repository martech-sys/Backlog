'use client';

import { useFormStatus } from 'react-dom';

export function SubmitButton({
  children,
  className = 'btn primary',
  name,
  value,
  pendingText = 'Menyimpan…',
}: {
  children: React.ReactNode;
  className?: string;
  name?: string;
  value?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value}>
      {pending ? pendingText : children}
    </button>
  );
}
