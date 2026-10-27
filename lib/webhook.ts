/**
 * Pesan masuk dari WA gateway: PIC membalas "ACC <ID>" atau "REV <ID> <catatan>".
 * ID boleh Task ID (CR-2610-001-1) atau Request ID (CR-2610-001 → semua task yang menunggu review).
 */
import { SHEETS, STATUS } from './config';
import { now } from './clock';
import { formatWib } from './dates';
import { loadDb } from './db';
import { findPersonByPhone, normalizePhone } from './master';
import { msg } from './messages';
import { Notifier } from './notify';
import { brandReview } from './service';
import type { Store } from './store';
import { isTaskId, parseWaReply, type CurrentUser } from './workflow';

export interface IncomingResult {
  handled: boolean;
  reply: string;
}

/** Ambil nomor pengirim & isi pesan dari payload Fonnte / Wablas / generik. */
export function extractIncoming(payload: Record<string, unknown>): { sender: string; message: string } {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = payload[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (typeof v === 'number') return String(v);
    }
    return '';
  };
  const data = (payload.data && typeof payload.data === 'object' ? payload.data : {}) as Record<string, unknown>;
  const sender = pick('sender', 'phone', 'from', 'number') || String(data.phone || data.sender || '');
  const message = pick('message', 'text', 'body', 'pesan') || String(data.message || data.text || '');
  return { sender: normalizePhone(sender.replace(/@.*$/, '')), message };
}

export async function handleIncoming(store: Store, sender: string, text: string): Promise<IncomingResult> {
  const db = await loadDb(store, { fresh: true });
  const person = findPersonByPhone(db.master, sender);
  await store.append(SHEETS.WA_LOG, [
    {
      Timestamp: formatWib(now()),
      Arah: 'IN',
      Nomor: sender,
      Nama: person?.name || '',
      Jenis: 'Balasan',
      'Ref ID': '',
      Pesan: text,
      Hasil: '',
    },
  ]);

  const parsed = parseWaReply(text);
  const notifier = new Notifier(db.master);
  const reply = async (body: string, handled: boolean): Promise<IncomingResult> => {
    notifier.toPhone(sender, person?.name || sender, 'Balasan bot', parsed?.id || '', body);
    await notifier.flush(store);
    return { handled, reply: body };
  };

  if (!parsed) {
    // Abaikan obrolan biasa; balas bantuan hanya bila pesan terlihat seperti perintah.
    if (/^\s*(acc|rev|revisi|help|bantuan)\b/i.test(text)) return reply(msg.waHelp(), false);
    return { handled: false, reply: '' };
  }
  if (!person) return reply('Nomor ini belum terdaftar di Master_PIC / Master_Tim. Hubungi Traffic.', false);

  const user: CurrentUser = { email: person.email, name: person.name, roles: person.roles, grup: person.grup };
  const targets = isTaskId(parsed.id)
    ? [parsed.id]
    : db.tasks.filter((t) => t['Request ID'] === parsed.id && t.Status === STATUS.REVIEW_BRAND).map((t) => t['Task ID']);
  if (!targets.length) return reply(`Tidak ada task ${parsed.id} yang sedang menunggu review.`, false);
  if (parsed.action === 'REV' && !parsed.note) return reply(`Tulis catatan revisinya, contoh:\nREV ${parsed.id} logo diperbesar`, false);

  const lines: string[] = [];
  for (const id of targets) {
    const r = await brandReview(store, user, id, parsed.action, parsed.note, 'WA');
    lines.push(`${r.ok ? '✅' : '❌'} ${id}: ${r.message}`);
  }
  return reply(msg.waReplyResult(lines), true);
}
