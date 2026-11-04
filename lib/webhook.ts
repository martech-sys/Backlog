/**
 * Pesan masuk dari WA gateway: PIC membalas "ACC <ID>" atau "REV <ID> <catatan>".
 * ID boleh Task ID (CR-2610-001-1) atau Request ID (CR-2610-001 → semua task yang menunggu review).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
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

export interface Incoming {
  /** Nomor pengirim (628…) untuk dicocokkan dengan master data; kosong bila tidak diketahui. */
  sender: string;
  /** Tujuan balasan bot: nomor atau JID asli pengirim. */
  replyTo: string;
  message: string;
  /** Alasan pesan diabaikan (bukan pesan masuk, dari bot sendiri, atau dari grup). */
  ignore?: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** "628123@s.whatsapp.net" / "628123:12@s.whatsapp.net" → "628123"; JID @lid/@g.us → "". */
export function phoneFromJid(jid: string): string {
  const [user, domain = 's.whatsapp.net'] = String(jid || '').split('@');
  if (!user || !['s.whatsapp.net', 'c.us'].includes(domain)) return '';
  return normalizePhone(user.split(':')[0]);
}

/** Teks dari isi pesan Baileys (teks biasa, teks panjang, caption media, pesan sementara). */
function textOfBaileys(m: unknown): string {
  if (!isObj(m)) return '';
  for (const wrap of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage']) {
    const inner = m[wrap];
    if (isObj(inner) && isObj(inner.message)) return textOfBaileys(inner.message);
  }
  if (str(m.conversation)) return str(m.conversation);
  for (const k of ['extendedTextMessage', 'imageMessage', 'videoMessage', 'documentMessage']) {
    const part = m[k];
    if (isObj(part)) {
      const t = str(part.text) || str(part.caption);
      if (t) return t;
    }
  }
  return '';
}

/**
 * Ambil pengirim & isi pesan dari payload webhook.
 *  - Lixus Gateway: { event: "message.received", message: <Baileys WAMessage> }
 *  - Fonnte / Wablas / generik: { sender|phone|from, message|text }
 */
export function extractIncoming(payload: Obj): Incoming {
  const event = str(payload.event);
  if (event || isObj(payload.message)) {
    if (event && event !== 'message.received') return { sender: '', replyTo: '', message: '', ignore: `event ${event}` };
    const wa = isObj(payload.message) ? payload.message : {};
    const key = isObj(wa.key) ? wa.key : {};
    const remoteJid = str(key.remoteJid);
    const text = textOfBaileys(wa.message);
    if (key.fromMe === true) return { sender: '', replyTo: remoteJid, message: text, ignore: 'fromMe' };
    if (/@(g\.us|broadcast|newsletter)$/.test(remoteJid)) return { sender: '', replyTo: remoteJid, message: text, ignore: 'grup/broadcast' };
    // Akun dengan LID (…@lid) tidak memuat nomor di remoteJid; Baileys menyertakannya di field lain.
    const sender =
      phoneFromJid(remoteJid) ||
      phoneFromJid(str(key.senderPn)) ||
      phoneFromJid(str(key.remoteJidAlt)) ||
      phoneFromJid(str(key.participantPn)) ||
      phoneFromJid(str(wa.senderPn));
    return { sender, replyTo: remoteJid || sender, message: text };
  }

  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = str(payload[k]);
      if (v) return v;
    }
    return '';
  };
  const data = isObj(payload.data) ? payload.data : {};
  const raw = pick('sender', 'phone', 'from', 'number') || str(data.phone) || str(data.sender);
  const sender = normalizePhone(raw.replace(/@.*$/, ''));
  const message = pick('message', 'text', 'body', 'pesan') || str(data.message) || str(data.text);
  if (payload.fromMe === true || payload.from_me === true) return { sender, replyTo: sender, message, ignore: 'fromMe' };
  return { sender, replyTo: sender, message };
}

/**
 * Verifikasi header X-Gateway-Signature (HMAC-SHA256 dari body mentah).
 * Menerima format hex atau base64, dengan atau tanpa awalan "sha256=".
 */
export function verifySignature(rawBody: string, header: string | null, secrets: string[]): boolean {
  const sig = String(header || '').trim().replace(/^sha256=/i, '');
  if (!sig) return false;
  for (const secret of secrets.filter(Boolean)) {
    const mac = createHmac('sha256', secret).update(rawBody, 'utf8').digest();
    for (const expected of [mac.toString('hex'), mac.toString('base64'), mac.toString('base64url')]) {
      const a = Buffer.from(expected);
      const b = Buffer.from(sig);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    }
  }
  return false;
}

export async function handleIncoming(store: Store, sender: string, text: string, replyTo = sender): Promise<IncomingResult> {
  const db = await loadDb(store, { fresh: true });
  const person = findPersonByPhone(db.master, sender);
  await store.append(SHEETS.WA_LOG, [
    {
      Timestamp: formatWib(now()),
      Arah: 'IN',
      Nomor: sender || replyTo,
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
    notifier.toPhone(replyTo, person?.name || sender || replyTo, 'Balasan bot', parsed?.id || '', body);
    await notifier.flush(store);
    return { handled, reply: body };
  };

  if (!parsed) {
    // Abaikan obrolan biasa; balas bantuan hanya bila pesan terlihat seperti perintah.
    if (/^\s*(acc|rev|revisi|help|bantuan)\b/i.test(text)) return reply(msg.waHelp(), false);
    return { handled: false, reply: '' };
  }
  if (!person) {
    return reply(
      sender
        ? `Nomor ${sender} belum terdaftar di Master_PIC / Master_Tim. Hubungi Traffic.`
        : 'Nomor WhatsApp-mu tidak terbaca oleh gateway. Silakan ACC/REV lewat web, atau hubungi Traffic.',
      false,
    );
  }

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
