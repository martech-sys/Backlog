import nodemailer, { type Transporter } from 'nodemailer';
import { SHEETS } from './config';
import { inSimulation, now } from './clock';
import { formatWib } from './dates';
import { env } from './env';
import type { Store } from './store';

export interface MailResult {
  ok: boolean;
  /** Terkirim · <id> | Belum dikirim: … | Gagal: … | DRY_RUN */
  detail: string;
}

export function emailConfigured(): boolean {
  return !!(env.smtpHost && env.emailFrom);
}

let transport: Transporter | null = null;
function getTransport(): Transporter {
  transport ||= nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
  });
  return transport;
}

/** Kirim satu email lalu catat hasilnya di tab Log_Email. Tidak pernah melempar error. */
export async function sendMail(
  store: Store,
  m: { to: string; nama: string; jenis: string; subject: string; html: string; text: string },
): Promise<MailResult> {
  let r: MailResult;
  if (env.demoMode || inSimulation()) {
    r = { ok: true, detail: 'DRY_RUN' };
  } else if (!emailConfigured()) {
    r = { ok: false, detail: 'Belum dikirim: SMTP belum diatur (SMTP_HOST, EMAIL_FROM)' };
  } else {
    try {
      const info = await getTransport().sendMail({ from: env.emailFrom, to: m.to, subject: m.subject, html: m.html, text: m.text });
      r = { ok: true, detail: `Terkirim · ${info.messageId || ''}`.trim() };
    } catch (e) {
      r = { ok: false, detail: `Gagal: ${(e as Error).message}`.slice(0, 300) };
    }
  }
  await store.append(SHEETS.LOG_EMAIL, [
    { Timestamp: formatWib(now()), Ke: m.to, Nama: m.nama, Jenis: m.jenis, Subjek: m.subject, Hasil: r.detail },
  ]);
  return r;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Kerangka HTML email sederhana yang aman di klien email umum. */
export function emailLayout(title: string, paragraphs: string[], button?: { label: string; href: string }, footer?: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#1c2230">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e6eb;border-top:4px solid #2f6fed;border-radius:6px">
<tr><td style="padding:24px 28px">
<div style="font-size:12px;font-weight:bold;color:#2f6fed;letter-spacing:.04em">CREATIVE REQUEST TRACKER</div>
<h1 style="font-size:20px;margin:8px 0 16px">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="font-size:14px;line-height:1.55;margin:0 0 12px">${p}</p>`).join('\n')}
${button ? `<p style="margin:20px 0"><a href="${esc(button.href)}" style="display:inline-block;background:#2f6fed;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:5px">${esc(button.label)}</a></p><p style="font-size:12px;color:#5b6474;margin:0 0 12px">Bila tombol tidak bisa diklik, salin link ini ke browser:<br><span style="word-break:break-all">${esc(button.href)}</span></p>` : ''}
${footer ? `<p style="font-size:12px;color:#8a93a3;margin:16px 0 0">${footer}</p>` : ''}
</td></tr></table></td></tr></table></body></html>`;
}

export { esc as escapeHtml };
