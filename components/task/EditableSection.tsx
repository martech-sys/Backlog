'use client';

import { createContext, useContext, useState } from 'react';

const Ctx = createContext<() => void>(() => {});

/**
 * Bagian yang bisa diedit: menampilkan `view`; tombol Edit menggantinya dengan `form` (berisi Simpan & Batal).
 * Beri `key` yang berubah setelah simpan agar kembali ke tampilan baca.
 */
export function EditableSection({
  title,
  canEdit,
  editLabel = 'Edit',
  view,
  form,
  id,
}: {
  title: React.ReactNode;
  canEdit: boolean;
  editLabel?: string;
  view: React.ReactNode;
  form: React.ReactNode;
  id?: string;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <section className="card" id={id}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        {canEdit && !editing ? (
          <button type="button" className="btn small" onClick={() => setEditing(true)}>
            ✎ {editLabel}
          </button>
        ) : null}
      </div>
      <Ctx.Provider value={() => setEditing(false)}>{editing ? form : view}</Ctx.Provider>
    </section>
  );
}

/** Tombol Batal di dalam form EditableSection. */
export function CancelEdit() {
  const close = useContext(Ctx);
  return (
    <button type="button" className="btn" onClick={close}>
      Batal
    </button>
  );
}
