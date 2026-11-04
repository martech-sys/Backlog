import { SHEETS } from './config';
import { now } from './clock';
import { formatWib } from './dates';
import { findPerson, type Master, type Person } from './master';
import type { Store } from './store';
import { sendWa } from './wa';

interface Outgoing {
  to: Person | { name: string; phone: string };
  jenis: string;
  refId: string;
  message: string;
}

/**
 * Kumpulkan pesan WA selama satu aksi, lalu kirim sekaligus dan catat ke Log_WA.
 * Kegagalan kirim tidak menggagalkan aksi; hasilnya tercatat di kolom "Hasil".
 */
export class Notifier {
  private queue: Outgoing[] = [];

  constructor(private master: Master) {}

  /** Kirim ke orang berdasarkan nama di master data. Nama kosong/tidak dikenal tetap dicatat. */
  to(name: string | undefined, jenis: string, refId: string, message: string): this {
    const n = String(name || '').trim();
    if (!n) return this;
    const person = findPerson(this.master, n) || { name: n, phone: '' };
    const dup = this.queue.some((q) => q.to.name === person.name && q.message === message);
    if (!dup) this.queue.push({ to: person, jenis, refId, message });
    return this;
  }

  toMany(names: (string | undefined)[], jenis: string, refId: string, message: string): this {
    for (const n of names) this.to(n, jenis, refId, message);
    return this;
  }

  toPhone(phone: string, name: string, jenis: string, refId: string, message: string): this {
    this.queue.push({ to: { name, phone }, jenis, refId, message });
    return this;
  }

  get size(): number {
    return this.queue.length;
  }

  async flush(store: Store): Promise<number> {
    const items = this.queue.splice(0);
    if (!items.length) return 0;
    const results = await Promise.all(items.map((i) => sendWa(i.to.phone, i.message)));
    const ts = formatWib(now());
    await store.append(
      SHEETS.WA_LOG,
      items.map((i, idx) => ({
        Timestamp: ts,
        Arah: 'OUT',
        Nomor: i.to.phone,
        Nama: i.to.name,
        Jenis: i.jenis,
        'Ref ID': i.refId,
        Pesan: i.message,
        Hasil: results[idx].ok ? results[idx].detail || 'OK' : `GAGAL: ${results[idx].detail}`,
      })),
    );
    return items.length;
  }
}
