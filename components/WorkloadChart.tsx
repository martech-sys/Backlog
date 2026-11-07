'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';

export interface WorkloadItem {
  name: string;
  divisi: string;
  count: number;
  capacity: number;
  over: boolean;
  tasks: { id: string; brand: string; status: string; deadline: string }[];
  /** Link Tracker berisi semua task aktif orang ini. */
  href: string;
}

const short = (name: string) => {
  const [a, b] = name.split(' ');
  return b && b.length <= 2 ? `${a} ${b}` : a;
};

/**
 * Grafik beban per anggota. Klik batang: 1 task → buka detail task, >1 task → popup daftar task,
 * 0 task → tidak ada data.
 */
export function WorkloadChart({ items, max }: { items: WorkloadItem[]; max: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<WorkloadItem | null>(null);

  const bar = (w: WorkloadItem) => (
    <>
      <span className="n">{w.count}</span>
      <span className={`col${w.over ? ' danger' : ''}`} style={{ height: `${(w.count / max) * 85}%` }} />
    </>
  );

  return (
    <>
      <div className="vbars">
        {items.map((w) => {
          const title = `${w.name} (${w.divisi}): ${w.count}/${w.capacity}`;
          if (w.count === 0)
            return (
              <div className="vbar" key={w.name} title={`${title} · Tidak ada data`}>
                {bar(w)}
              </div>
            );
          if (w.count === 1)
            return (
              <Link
                className="vbar link"
                key={w.name}
                href={`/tasks/${encodeURIComponent(w.tasks[0].id)}`}
                title={`${title} · buka ${w.tasks[0].id}`}
              >
                {bar(w)}
              </Link>
            );
          return (
            <button
              type="button"
              className="vbar link"
              key={w.name}
              title={`${title} · lihat daftar task`}
              onClick={() => {
                setOpen(w);
                dialog.current?.showModal();
              }}
            >
              {bar(w)}
            </button>
          );
        })}
      </div>
      <div className="vbar-labels">
        {items.map((w) => (
          <span key={w.name} title={w.name}>
            {short(w.name)}
          </span>
        ))}
      </div>

      <dialog
        ref={dialog}
        className="modal"
        onClose={() => setOpen(null)}
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      >
        {open ? (
          <div className="modal-body">
            <div
              className="row"
              style={{
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <h3 style={{ margin: 0 }}>
                {open.name} · {open.count} task aktif
              </h3>
              <button type="button" className="btn small" onClick={() => dialog.current?.close()} aria-label="Tutup">
                ×
              </button>
            </div>
            <p className="subtle" style={{ marginTop: 4 }}>
              {open.divisi} · kapasitas {open.capacity}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Brand</th>
                    <th>Status</th>
                    <th>Deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {open.tasks.map((t) => (
                    <tr key={t.id}>
                      <td className="nowrap">
                        <Link className="title" href={`/tasks/${encodeURIComponent(t.id)}`}>
                          {t.id}
                        </Link>
                      </td>
                      <td>{t.brand}</td>
                      <td>{t.status}</td>
                      <td className="nowrap">{t.deadline || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ marginBottom: 0 }}>
              <Link href={open.href}>Buka di Tracker →</Link>
            </p>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
