'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Bilah aksi massal untuk daftar Request: hitung request yang dicentang, pilih Approve (✓) atau Reject (✗),
 * lalu Apply. Reject wajib alasan dan minta konfirmasi. Dipasang di dalam <form> yang memuat checkbox `ids`.
 */
export function BulkBar({ selectable }: { selectable: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const [decision, setDecision] = useState<'Lengkap' | 'Kurang' | ''>('');

  useEffect(() => {
    const form = ref.current?.closest('form');
    if (!form) return;
    const recount = () => setCount(form.querySelectorAll<HTMLInputElement>('input[name="ids"]:checked').length);
    form.addEventListener('change', recount);
    recount();
    return () => form.removeEventListener('change', recount);
  }, []);

  const toggleAll = (on: boolean) => {
    const form = ref.current?.closest('form');
    form?.querySelectorAll<HTMLInputElement>('input[name="ids"]').forEach((x) => (x.checked = on));
    setCount(on ? selectable : 0);
  };

  if (!selectable) return null;
  return (
    <div className={`bulk-bar${count ? ' on' : ''}`} ref={ref}>
      <label className="bulk-all">
        <input type="checkbox" checked={count > 0 && count === selectable} onChange={(e) => toggleAll(e.target.checked)} aria-label="Select all" />
        <span>
          <b>{count}</b> selected
        </span>
      </label>
      <div className="bulk-choice" role="radiogroup" aria-label="Bulk action">
        <button
          type="button"
          className={`btn small${decision === 'Lengkap' ? ' success' : ''}`}
          aria-pressed={decision === 'Lengkap'}
          onClick={() => setDecision('Lengkap')}
        >
          ✓ Approve
        </button>
        <button
          type="button"
          className={`btn small${decision === 'Kurang' ? ' danger-solid' : ''}`}
          aria-pressed={decision === 'Kurang'}
          onClick={() => setDecision('Kurang')}
        >
          ✗ Reject
        </button>
      </div>
      <input type="hidden" name="decision" value={decision} />
      {decision === 'Kurang' ? (
        <input name="note" type="text" required placeholder="Reason for PIC (required)" className="bulk-note" aria-label="Reason for rejection" />
      ) : null}
      <button
        type="submit"
        className="btn primary small"
        disabled={!count || !decision}
        onClick={(e) => {
          const noun = count === 1 ? 'request' : 'requests';
          const text =
            decision === 'Kurang'
              ? `Reject ${count} ${noun}? They go back to the PIC as "Brief Kurang" with your reason.`
              : `Approve ${count} ${noun}? Tasks are created and sent to division leads.`;
          if (!window.confirm(text)) e.preventDefault();
        }}
      >
        Apply to selected
      </button>
      <span className="subtle bulk-help">
        {decision === 'Lengkap'
          ? 'Uses each request’s own deadline; lead & assignee follow the category defaults.'
          : decision === 'Kurang'
            ? 'All selected requests get the same reason.'
            : 'Tick requests waiting for a brief check, then choose an action.'}
      </span>
    </div>
  );
}
