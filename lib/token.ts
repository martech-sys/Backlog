/**
 * Token sesi bertanda tangan HMAC-SHA256 (Web Crypto, aman dipakai di proxy maupun server).
 * Isi: email, versi password (berubah saat password diganti/di-reset), wajib ganti password, kedaluwarsa.
 */

export const SESSION_COOKIE = 'ct_session';
export const SESSION_DAYS = 14;

export interface SessionPayload {
  /** email (huruf kecil) */
  e: string;
  /** versi password; token lama otomatis tidak berlaku saat password berubah */
  v: string;
  /** 1 = wajib ganti password sebelum memakai aplikasi */
  m: 0 | 1;
  /** kedaluwarsa (epoch detik) */
  x: number;
}

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): string {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Rahasia penandatangan sesi. Mode demo memakai rahasia tetap agar bisa dicoba tanpa konfigurasi. */
export function authSecret(): string {
  const s = process.env.AUTH_SECRET || '';
  if (s) return s;
  return /^(1|true|yes)$/i.test(process.env.DEMO_MODE || '') ? 'demo-mode-only-secret-not-for-production' : '';
}

export async function signSession(p: Omit<SessionPayload, 'x'> & { x?: number }, secret = authSecret()): Promise<string> {
  if (!secret) throw new Error('AUTH_SECRET belum diatur.');
  const payload: SessionPayload = { ...p, x: p.x ?? Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400 };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(secret, body)}`;
}

export async function verifySession(token: string | undefined, secret = authSecret()): Promise<SessionPayload | null> {
  if (!token || !secret) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  if (!safeEqual(sig, await hmac(secret, body))) return null;
  try {
    const p = JSON.parse(fromB64url(body)) as SessionPayload;
    if (typeof p.e !== 'string' || typeof p.x !== 'number' || p.x < Date.now() / 1000) return null;
    return p;
  } catch {
    return null;
  }
}
