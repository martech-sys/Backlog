/**
 * Uji end-to-end alur lengkap lewat browser (mode demo).
 *
 *   DEMO_MODE=true WEBHOOK_KEY=testkey CRON_SECRET=testcron npm run build && npm start -- -p 3100
 *   BASE_URL=http://localhost:3100 npm run test:e2e
 *
 * Butuh Playwright (`npm i -D playwright` atau Playwright global).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright'));
}

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const WEBHOOK_KEY = process.env.WEBHOOK_KEY || 'testkey';
const CRON_SECRET = process.env.CRON_SECRET || 'testcron';
const SHOTS = process.env.SHOTS_DIR || '';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const step = (name) => console.log(`• ${name}`);
const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

async function loginAs(name) {
  await ctx.clearCookies();
  await page.goto(`${BASE}/login`);
  await page.locator('.persona-list button', { hasText: new RegExp(`^${name}`) }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

async function flash() {
  return (await page.locator('.flash').first().textContent())?.trim();
}

async function taskStatus(taskId) {
  await page.goto(`${BASE}/tasks/${taskId}`);
  return (await page.locator('h1 .badge').first().textContent())?.trim();
}

// 1. Validasi form
step('PIC: form kosong menampilkan error & nilai tidak hilang');
await loginAs('Brama');
await page.goto(`${BASE}/requests/new`);
await page.fill('#campaignName', 'E2E Launch');
await page.getByRole('button', { name: 'Kirim request' }).click();
await page.waitForSelector('.field .error');
assert.equal(await page.inputValue('#campaignName'), 'E2E Launch');
assert.ok((await page.locator('.field .error').count()) >= 5);

// 2. Submit request
step('PIC: kirim request Desain grafis');
await page.selectOption('#brand', 'Heymale');
await page.selectOption('#campaignType', 'Small Campaign');
await page.fill('#objective', 'Uji alur end-to-end');
await page.locator('label.choice', { hasText: 'Desain grafis' }).click();
await page.locator('label.choice', { hasText: 'Poster' }).click();
await page.fill('[name="detail:Desain grafis:ukuran"]', '1080x1350');
await page.fill('[name="detail:Desain grafis:jumlahDesain"]', '2');
await page.fill('#usp', 'Bahan adem');
await page.fill('#keyMessage', 'Diskon 50%');
await page.fill('#creativeNote', 'Bold');
await page.fill('#targetAudience', 'Pria 20-30');
await page.fill('#budget', '1500000');
const due = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
await page.fill('#dueDate', due);
await page.fill('#deliverables', 'Poster (2)');
await shot('01-form');
await page.getByRole('button', { name: 'Kirim request' }).click();
await page.waitForURL(/\/requests\/CR-\d{4}-\d{3}\?ok=/);
const requestId = decodeURIComponent(new URL(page.url()).pathname.split('/').pop());
assert.match(await flash(), /terkirim/);
console.log(`  ${requestId}`);

// 3. Traffic cek brief
step('Traffic: brief lengkap → task dibuat & auto-assign desainer');
await loginAs('Evi');
await page.goto(`${BASE}/requests/${requestId}`);
await shot('02-cek-brief');
await page.getByRole('button', { name: 'Brief lengkap, proses' }).click();
await page.waitForURL(/ok=/);
assert.match(await flash(), /1 task dibuat/);
const taskId = `${requestId}-1`;
const assignee = (await page.locator('table tbody tr td').nth(3).textContent()).trim();
assert.match(assignee, /^Desainer|^Intern/);
console.log(`  ${taskId} → ${assignee}`);

// 4. Assignee upload draft
step('Assignee: upload draft v1');
await loginAs(assignee);
await page.goto(`${BASE}/tasks/${taskId}`);
await page.fill('#link', 'https://drive.google.com/e2e/v1');
await page.getByRole('button', { name: 'Kirim ke QC' }).click();
await page.waitForURL(/ok=/);
assert.equal(await taskStatus(taskId), 'QC Lead');

// 5. Lead QC lolos
step('Lead: QC lolos → Review Brand');
await loginAs('Aulia Pramudya');
await page.goto(`${BASE}/tasks/${taskId}`);
await page.getByRole('button', { name: 'Lolos QC, kirim ke brand' }).click();
await page.waitForURL(/ok=/);
assert.equal(await taskStatus(taskId), 'Review Brand');

// 6. PIC REV lewat webhook WhatsApp
step('Webhook WA: PIC membalas REV');
const { demoSeedMaster } = await import('../../lib/demo.ts');
const pic = demoSeedMaster().Master_PIC.find((r) => r[0] === 'Brama');
const bad = await fetch(`${BASE}/api/wa/webhook?key=salah`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
assert.equal(bad.status, 401);
const res = await fetch(`${BASE}/api/wa/webhook?key=${WEBHOOK_KEY}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ sender: String(pic[3]), message: `REV ${taskId} logo diperbesar` }),
});
const body = await res.json();
assert.equal(body.handled, true, JSON.stringify(body));
assert.equal(await taskStatus(taskId), 'Revisi Brand');

// 7. Revisi → QC → ACC lewat web
step('Assignee revisi → lead QC → PIC ACC lewat web');
await loginAs(assignee);
await page.goto(`${BASE}/tasks/${taskId}`);
await page.fill('#link', 'https://drive.google.com/e2e/v2');
await page.getByRole('button', { name: 'Kirim ke QC' }).click();
await page.waitForURL(/ok=/);
await loginAs('Aulia Pramudya');
await page.goto(`${BASE}/tasks/${taskId}`);
await page.getByRole('button', { name: 'Lolos QC, kirim ke brand' }).click();
await page.waitForURL(/ok=/);
await loginAs('Brama');
await page.goto(`${BASE}/tasks/${taskId}`);
await shot('03-review');
await page.getByRole('button', { name: 'ACC', exact: true }).click();
await page.waitForURL(/ok=/);
assert.equal(await taskStatus(taskId), 'ACC');

// 8. Final & tutup
step('Assignee upload final → Traffic tutup tiket');
await loginAs(assignee);
await page.goto(`${BASE}/tasks/${taskId}`);
await page.fill('#final', 'https://drive.google.com/e2e/final');
await page.getByRole('button', { name: 'Simpan file final' }).click();
await page.waitForURL(/ok=/);
await loginAs('Evi');
await page.goto(`${BASE}/tasks/${taskId}`);
await page.getByRole('button', { name: 'Tutup tiket' }).click();
await page.waitForURL(/ok=/);
assert.match(await flash(), /selesai/);
await page.goto(`${BASE}/requests/${requestId}`);
assert.equal((await page.locator('h1 .badge').first().textContent()).trim(), 'Selesai');
const waCount = await page.locator('section:has(h2:text("Notifikasi WA")) .timeline li').count();
assert.ok(waCount >= 8, `notifikasi WA tercatat (${waCount})`);
await shot('04-request-selesai');

// 9. Hak akses: PIC tidak bisa QC
step('Hak akses: anggota tim tidak melihat tombol QC/cek brief');
await loginAs(assignee);
await page.goto(`${BASE}/requests/new`);
assert.ok(page.url().includes('/requests?err='), 'anggota tim tidak boleh membuat request');

// 10. Cron
step('Cron: butuh CRON_SECRET');
assert.equal((await fetch(`${BASE}/api/cron/reminders`)).status, 401);
for (const job of ['reminders', 'digest', 'weekly']) {
  const r = await fetch(`${BASE}/api/cron/${job}`, { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  console.log(`  ${job}: ${j.messages} pesan`);
}

// 11. Halaman utama tanpa error
step('Halaman utama tampil tanpa error');
for (const p of ['/backlog', '/backlog?by=brand', '/dashboard?periode=7', '/tracker?view=overdue', '/requests?view=semua', '/panduan']) {
  const r = await page.goto(`${BASE}${p}`);
  assert.equal(r.status(), 200, p);
}
assert.deepEqual(errors, []);

await browser.close();
console.log('\nE2E OK');
