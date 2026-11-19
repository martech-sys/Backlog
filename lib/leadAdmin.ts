/**
 * Ganti lead seseorang (poin 16): admin memilih lead lama dan penggantinya. Semua task aktif yang lead-nya
 * orang lama dialihkan, aturan kategori (Lead Menswear/Womenswear) ikut diganti, dan — bila dipilih —
 * peran lead orang lama dicabut di Master_Tim. Pengganti otomatis ditandai sebagai lead.
 */
import { DONE_STATUSES, SHEETS, type Status } from './config';
import { now } from './clock';
import { formatWib } from './dates';
import { loadDb } from './db';
import { findPerson } from './master';
import { Notifier } from './notify';
import { logAdmin } from './people';
import type { Cell, Store } from './store';
import { taskTitle } from './taskInfo';
import { ballHolder, can, type CurrentUser } from './workflow';

export const canReplaceLead = (u: CurrentUser) => can.override(u);

export interface ReplaceLeadResult {
  ok: boolean;
  message: string;
  tasks?: number;
  rules?: number;
}

export async function replaceLead(
  store: Store,
  user: CurrentUser,
  p: { from: string; to: string; removeRole: boolean },
): Promise<ReplaceLeadResult> {
  if (!canReplaceLead(user)) return { ok: false, message: 'Hanya admin yang bisa mengganti lead.' };
  const db = await loadDb(store, { fresh: true });
  const from = findPerson(db.master, p.from.trim());
  const to = findPerson(db.master, p.to.trim());
  if (!from) return { ok: false, message: 'Pilih lead yang akan diganti.' };
  if (!to || !to.active || !to.sources.includes('tim')) return { ok: false, message: 'Pengganti harus anggota tim creative yang aktif.' };
  if (from.name === to.name) return { ok: false, message: 'Lead lama dan pengganti tidak boleh orang yang sama.' };
  const ts = formatWib(now());

  // 1. Task aktif
  const traffic = new Map(db.requests.map((r) => [r['Request ID'], r.Traffic]));
  const reqById = new Map(db.requests.map((r) => [r['Request ID'], r]));
  const tasks = db.tasks.filter((t) => t.Lead === from.name && !DONE_STATUSES.includes(t.Status as Status));
  if (tasks.length)
    await store.update(
      SHEETS.TASK,
      'Task ID',
      tasks.map((t) => ({
        key: t['Task ID'],
        patch: { Lead: to.name, 'Bola di': ballHolder(t.Status, { ...t, Lead: to.name }, traffic.get(t['Request ID']) || '') },
      })),
    );

  // 2. Aturan kategori
  const rules = db.master.kategori.filter((k) => k.leadMenswear === from.name || k.leadWomenswear === from.name);
  const withCode = rules.filter((k) => k.code);
  if (withCode.length)
    await store.update(
      SHEETS.KATEGORI,
      'Kode',
      withCode.map((k) => {
        const patch: Record<string, Cell> = {};
        if (k.leadMenswear === from.name) patch['Lead Menswear'] = to.name;
        if (k.leadWomenswear === from.name) patch['Lead Womenswear'] = to.name;
        return { key: k.code, patch };
      }),
    );

  // 3. Peran lead di Master_Tim
  const tim = (await store.readAll([SHEETS.TIM], { fresh: true }))[SHEETS.TIM];
  const rowOf = (name: string) => tim.find((r) => String(r.Nama || '').trim().toLowerCase() === name.toLowerCase());
  const toRow = rowOf(to.name);
  if (toRow && !/^(ya|y|true)$/i.test(String(toRow.Lead || ''))) await store.update(SHEETS.TIM, 'Nama', [{ key: toRow.Nama, patch: { Lead: 'Ya' } }]);
  const fromRow = rowOf(from.name);
  if (p.removeRole && fromRow) {
    const title = String(fromRow.Peran || '');
    await store.update(SHEETS.TIM, 'Nama', [
      { key: fromRow.Nama, patch: { Lead: 'Tidak', ...(/^lead\b/i.test(title) ? { Peran: 'Staff' } : {}) } },
    ]);
  }

  // Riwayat & notifikasi
  if (tasks.length)
    await store.append(
      SHEETS.STATUS_LOG,
      tasks.map((t) => ({ Timestamp: ts, ID: t['Task ID'], Level: 'Task', Dari: t.Status, Ke: t.Status, Oleh: user.name, Catatan: `Lead diganti: ${from.name} → ${to.name}` })),
    );
  await logAdmin(store, {
    by: user.name,
    aksi: 'Ganti lead',
    target: from.name,
    dari: `${from.name}${p.removeRole ? ' (peran lead dicabut)' : ''}`,
    ke: `${to.name} · ${tasks.length} task aktif · ${rules.length} aturan kategori`,
  });
  if (tasks.length) {
    const notify = new Notifier(db.master);
    const lines = tasks.slice(0, 15).map((t) => `• ${t['Task ID']} · ${taskTitle(t, reqById.get(t['Request ID']))} (${t.Status})`);
    const more = tasks.length > 15 ? `\n…dan ${tasks.length - 15} task lainnya` : '';
    notify.to(
      to.name,
      'Lead diganti',
      tasks[0]['Task ID'],
      `👤 *Kamu sekarang lead untuk ${tasks.length} task* (menggantikan ${from.name})\n${lines.join('\n')}${more}`,
    );
    await notify.flush(store);
  }
  const skipped = rules.length - withCode.length;
  return {
    ok: true,
    tasks: tasks.length,
    rules: rules.length,
    message:
      `Lead ${from.name} diganti ${to.name}: ${tasks.length} task aktif dialihkan, ${withCode.length} aturan kategori diperbarui` +
      `${p.removeRole ? `, peran lead ${from.name} dicabut` : ''}.` +
      (skipped ? ` ${skipped} aturan kategori tanpa kode tidak bisa diubah otomatis; ubah di Kelola kategori.` : ''),
  };
}
