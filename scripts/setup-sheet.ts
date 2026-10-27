/**
 * Membuat tab & header yang belum ada di spreadsheet database, lalu mengisi master data awal
 * hanya untuk tab yang masih kosong. Aman dijalankan berulang (tidak menimpa data).
 *
 *   npm run setup-sheet
 */
import { HEADERS, SEED } from '../lib/config';
import { env } from '../lib/env';
import { SheetsStore } from '../lib/store/sheets';
import type { Cell } from '../lib/store/types';

if (!env.serviceAccountEmail || !env.serviceAccountKey) {
  console.error('Isi GOOGLE_SERVICE_ACCOUNT_EMAIL dan GOOGLE_PRIVATE_KEY di .env.local terlebih dulu.');
  process.exit(1);
}

const store = new SheetsStore(env.spreadsheetId, env.serviceAccountEmail, env.serviceAccountKey);
const written = await store.ensureSheets(HEADERS, SEED as Record<string, Cell[][]>);
console.log(written.length ? `Diisi: ${written.join(', ')}` : 'Semua tab sudah ada, tidak ada yang diubah.');
const tables = await store.readAll(Object.keys(HEADERS) as (keyof typeof HEADERS)[]);
for (const [name, rows] of Object.entries(tables)) console.log(`  ${name.padEnd(16)} ${rows.length} baris`);
