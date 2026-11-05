import { SHEETS } from './config';
import { now } from './clock';
import { formatWib } from './dates';
import { findPerson, type Master, type Person } from './master';
import type { Store } from './store';
import { env } from './env';
import { isDryRun, sendWa, type SendResult } from './wa';

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

  /**
   * Kirim semua pesan yang terkumpul. Satu orang hanya menerima SATU pesan per aksi: bila ada
   * beberapa pesan untuk orang yang sama (mis. lead sekaligus assignee), isinya digabung.
   * Pesan dikirim berurutan dengan jeda (WA_DELAY_MS) agar tidak dianggap spam.
   */
  async flush(store: Store): Promise<number> {
    const items = this.queue.splice(0);
    if (!items.length) return 0;
    const groups: Outgoing[] = [];
    for (const i of items) {
      const key = (i.to.phone || i.to.name).toLowerCase();
      const g = groups.find((x) => (x.to.phone || x.to.name).toLowerCase() === key);
      if (!g) groups.push({ ...i });
      else {
        if (!g.message.includes(i.message)) g.message = `${g.message}\n\n────────\n\n${i.message}`;
        if (!g.jenis.split(' + ').includes(i.jenis)) g.jenis = `${g.jenis} + ${i.jenis}`;
        if (i.refId && !g.refId.split(', ').includes(i.refId)) g.refId = g.refId ? `${g.refId}, ${i.refId}` : i.refId;
      }
    }
    const dryRun = isDryRun(this.master.config.waDryRun);
    const results: SendResult[] = [];
    let sentBefore = false;
    for (const g of groups) {
      if (sentBefore && !dryRun && g.to.phone && env.waDelayMs > 0) await new Promise((r) => setTimeout(r, env.waDelayMs));
      const r = await sendWa(g.to.phone, g.message, { dryRun });
      if (!r.skipped) sentBefore = true;
      results.push(r);
    }
    const ts = formatWib(now());
    await store.append(
      SHEETS.WA_LOG,
      groups.map((g, idx) => ({
        Timestamp: ts,
        Arah: 'OUT',
        Nomor: g.to.phone,
        Nama: g.to.name,
        Jenis: g.jenis,
        'Ref ID': g.refId,
        Pesan: g.message,
        Hasil: results[idx].detail,
      })),
    );
    return groups.length;
  }
}
