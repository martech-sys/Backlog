import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, test } from 'node:test';
import { setClock } from '../../lib/clock';
import { loadDb } from '../../lib/db';
import { env } from '../../lib/env';
import { gatewayStatus, sendWa } from '../../lib/wa';
import { extractIncoming, handleIncoming, phoneFromJid, verifySignature } from '../../lib/webhook';
import { testStore } from './helpers';

const realFetch = globalThis.fetch;
const saved = { ...env };
beforeEach(() => {
  Object.assign(env, { waProvider: 'lixus', waApiUrl: 'https://wa.example.com', waToken: 'key-123', waDryRun: false });
});
afterEach(() => {
  globalThis.fetch = realFetch;
  Object.assign(env, saved);
  setClock(null);
});

const lixus = (message: Record<string, unknown>, key: Record<string, unknown> = {}) => ({
  event: 'message.received',
  sessionId: '0b8f-uuid',
  message: { key: { remoteJid: '6281234567890@s.whatsapp.net', fromMe: false, id: '3EB0', ...key }, pushName: 'Brama', message },
});

test('payload Lixus: teks, teks panjang, caption, pesan sementara', () => {
  assert.deepEqual(extractIncoming(lixus({ conversation: 'ACC CR-2610-001-1' })), {
    sender: '6281234567890',
    replyTo: '6281234567890@s.whatsapp.net',
    message: 'ACC CR-2610-001-1',
  });
  assert.equal(extractIncoming(lixus({ extendedTextMessage: { text: 'REV CR-2610-001-1 logo' } })).message, 'REV CR-2610-001-1 logo');
  assert.equal(extractIncoming(lixus({ imageMessage: { caption: 'REV CR-2610-001-1 lihat foto' } })).message, 'REV CR-2610-001-1 lihat foto');
  assert.equal(extractIncoming(lixus({ ephemeralMessage: { message: { conversation: 'ACC X' } } })).message, 'ACC X');
});

test('payload Lixus: abaikan pesan bot sendiri, grup, dan event lain', () => {
  assert.equal(extractIncoming(lixus({ conversation: 'hai' }, { fromMe: true })).ignore, 'fromMe');
  assert.equal(extractIncoming(lixus({ conversation: 'ACC X' }, { remoteJid: '120363@g.us' })).ignore, 'grup/broadcast');
  assert.equal(extractIncoming({ event: 'message.status', messageId: 'x' }).ignore, 'event message.status');
  assert.equal(extractIncoming({ event: 'session.status', status: 'connected' }).ignore, 'event session.status');
});

test('payload Lixus: akun LID memakai senderPn / remoteJidAlt bila ada', () => {
  const a = extractIncoming(lixus({ conversation: 'ACC X' }, { remoteJid: '1234567@lid', senderPn: '6281111@s.whatsapp.net' }));
  assert.deepEqual([a.sender, a.replyTo], ['6281111', '1234567@lid']);
  const b = extractIncoming(lixus({ conversation: 'ACC X' }, { remoteJid: '1234567@lid', remoteJidAlt: '6282222:5@s.whatsapp.net' }));
  assert.equal(b.sender, '6282222');
  const c = extractIncoming(lixus({ conversation: 'ACC X' }, { remoteJid: '1234567@lid' }));
  assert.deepEqual([c.sender, c.replyTo], ['', '1234567@lid']);
  assert.equal(phoneFromJid('08123@c.us'), '628123');
});

test('payload generik (Fonnte/Wablas) tetap didukung', () => {
  assert.deepEqual(extractIncoming({ sender: '081234', message: 'ACC X' }), { sender: '6281234', replyTo: '6281234', message: 'ACC X' });
});

test('verifikasi X-Gateway-Signature (hex/base64, dengan/tanpa sha256=)', () => {
  const body = JSON.stringify(lixus({ conversation: 'ACC X' }));
  const mac = createHmac('sha256', 'rahasia').update(body).digest();
  assert.equal(verifySignature(body, mac.toString('hex'), ['rahasia']), true);
  assert.equal(verifySignature(body, `sha256=${mac.toString('hex')}`, ['', 'rahasia']), true);
  assert.equal(verifySignature(body, mac.toString('base64'), ['rahasia']), true);
  assert.equal(verifySignature(body, mac.toString('hex'), ['salah']), false);
  assert.equal(verifySignature(body + ' ', mac.toString('hex'), ['rahasia']), false);
  assert.equal(verifySignature(body, null, ['rahasia']), false);
});

test('kirim lewat Lixus: endpoint, header X-API-Key, body {to,text}, dan pesan error', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  let status = 200;
  let reply: unknown = { success: true, messageId: '3EB0ABC' };
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(reply), { status });
  }) as typeof fetch;

  assert.deepEqual(await sendWa('6281234', 'Halo'), { ok: true, detail: 'OK 3EB0ABC' });
  assert.equal(calls[0].url, 'https://wa.example.com/api/messages/send');
  assert.equal((calls[0].init.headers as Record<string, string>)['X-API-Key'], 'key-123');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { to: '6281234', text: 'Halo' });

  status = 401;
  reply = { error: 'Invalid API key' };
  assert.match((await sendWa('6281234', 'x')).detail, /API key Lixus salah.*Invalid API key/);
  status = 503;
  reply = { error: 'Session not active' };
  const r = await sendWa('6281234', 'x');
  assert.equal(r.ok, false);
  assert.match(r.detail, /tidak aktif \(503\)/);

  env.waDryRun = true;
  assert.equal((await sendWa('6281234', 'x')).detail, 'DRY_RUN');
  assert.equal(calls.length, 3, 'dry-run tidak memanggil gateway');
});

test('status gateway Lixus', async () => {
  globalThis.fetch = (async (url: string) => {
    assert.equal(String(url), 'https://wa.example.com/api/status');
    return new Response(JSON.stringify({ status: 'connected', phoneNumber: '628999', uptime: '2h 45m' }));
  }) as typeof fetch;
  const s = await gatewayStatus();
  assert.deepEqual([s.connected, s.phoneNumber, s.uptime], [true, '628999', '2h 45m']);
  env.waApiUrl = '';
  assert.equal((await gatewayStatus()).configured, false);
});

test('balasan bot dikirim ke JID asli pengirim (termasuk akun LID)', async () => {
  const sent: { to: string; text: string }[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ success: true, messageId: 'm1' }));
  }) as typeof fetch;
  const store = testStore();
  const r = await handleIncoming(store, '', 'ACC CR-2610-001-1', '1234567@lid');
  assert.equal(r.handled, false);
  assert.equal(sent[0].to, '1234567@lid');
  assert.match(sent[0].text, /tidak terbaca/);
  const db = await loadDb(store, { withWaLog: true });
  assert.ok(db.waLog.some((w) => w.Arah === 'IN' && w.Nomor === '1234567@lid'));
  assert.ok(db.waLog.some((w) => w.Arah === 'OUT' && w.Hasil === 'OK m1'));
});
