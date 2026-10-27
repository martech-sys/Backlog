import { JWT } from 'google-auth-library';
import type { SheetName } from '../config';
import { normalizeCellDate } from '../dates';
import type { Cell, Row, Store } from './types';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

/** Header yang berisi tanggal: serial number Sheets dinormalisasi ke teks WIB. */
const DATE_HEADERS = new Set([
  'Timestamp',
  'Dibuat',
  'Due Date',
  'Deadline',
  'Target Draft',
  'Status Sejak',
  'Brief OK Pada',
  'Selesai Pada',
  'Tanggal',
]);

export function columnLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const q = (name: string) => `'${name.replace(/'/g, "''")}'`;

function cellToString(header: string, v: unknown): string {
  if (v === null || v === undefined) return '';
  if (DATE_HEADERS.has(header)) return normalizeCellDate(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

export function rowsFromValues(values: unknown[][]): Row[] {
  const [headerRow = [], ...body] = values;
  const headers = headerRow.map((h) => String(h ?? '').trim());
  const rows: Row[] = [];
  body.forEach((vals, i) => {
    if (!vals || vals.every((v) => v === '' || v === null || v === undefined)) return;
    const row = { _row: i + 2 } as Row;
    headers.forEach((h, c) => {
      if (h) row[h] = cellToString(h, vals[c]);
    });
    rows.push(row);
  });
  return rows;
}

const HEADER_TTL_MS = 10 * 60 * 1000;
const READ_TTL_MS = 5 * 1000;

export class SheetsStore implements Store {
  private jwt: JWT;
  /** Header per sheet (jarang berubah) agar append/update tidak perlu membaca baris 1 tiap kali. */
  private headerCache = new Map<string, { at: number; headers: string[] }>();
  /** Cache baca sangat singkat untuk meredam lonjakan (kuota Sheets API ±60 baca/menit). Dibuang setiap ada tulis. */
  private readCache = new Map<string, { at: number; data: Promise<Record<string, Row[]>> }>();

  constructor(
    private spreadsheetId: string,
    clientEmail: string,
    privateKey: string,
  ) {
    this.jwt = new JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  private async call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const { token } = await this.jwt.getAccessToken();
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${API}/${this.spreadsheetId}${path}`, {
        method: init.method || 'GET',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: init.body ? JSON.stringify(init.body) : undefined,
        cache: 'no-store',
      });
      if (res.ok) return (await res.json()) as T;
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
      throw new Error(`Google Sheets API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
  }

  /** Baca range A1 (sheet utuh bila tanpa "!"); hasil dikunci dengan string range yang diminta. */
  private async readRaw(ranges: string[]): Promise<Record<string, unknown[][]>> {
    const params = new URLSearchParams({
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'SERIAL_NUMBER',
    });
    for (const r of ranges) params.append('ranges', r.includes('!') ? r : q(r));
    const data = await this.call<{ valueRanges: { values?: unknown[][] }[] }>(`/values:batchGet?${params}`);
    const out: Record<string, unknown[][]> = {};
    ranges.forEach((r, i) => (out[r] = data.valueRanges[i]?.values || []));
    return out;
  }

  async readAll(names: SheetName[], opts: { fresh?: boolean } = {}): Promise<Record<string, Row[]>> {
    const key = names.join('|');
    const hit = this.readCache.get(key);
    if (!opts.fresh && hit && Date.now() - hit.at < READ_TTL_MS) return hit.data;
    const data = this.readRaw(names).then((raw) => {
      const out: Record<string, Row[]> = {};
      for (const n of names) {
        out[n] = rowsFromValues(raw[n]);
        const headers = (raw[n][0] || []).map((h) => String(h ?? '').trim());
        if (headers.length) this.headerCache.set(n, { at: Date.now(), headers });
      }
      return out;
    });
    this.readCache.set(key, { at: Date.now(), data });
    data.catch(() => this.readCache.delete(key));
    return data;
  }

  private async headersOf(name: string): Promise<string[]> {
    const hit = this.headerCache.get(name);
    if (hit && Date.now() - hit.at < HEADER_TTL_MS) return hit.headers;
    const range = `${q(name)}!1:1`;
    const headers = ((await this.readRaw([range]))[range][0] || []).map((h) => String(h ?? '').trim());
    this.headerCache.set(name, { at: Date.now(), headers });
    return headers;
  }

  async append(name: SheetName, rows: Record<string, Cell>[]): Promise<void> {
    if (!rows.length) return;
    this.readCache.clear();
    const headers = await this.headersOf(name);
    const values = rows.map((r) => headers.map((h) => (h in r ? r[h] : '')));
    await this.call(`/values/${encodeURIComponent(`${q(name)}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      body: { values },
    });
  }

  async update(
    name: SheetName,
    keyHeader: string,
    updates: { key: string; patch: Record<string, Cell> }[],
  ): Promise<void> {
    if (!updates.length) return;
    this.readCache.clear();
    const headers = await this.headersOf(name);
    const keyCol = headers.indexOf(keyHeader);
    if (keyCol < 0) throw new Error(`Kolom "${keyHeader}" tidak ditemukan di sheet ${name}`);

    // Cari nomor baris dari kolom kunci saat ini (aman walau sheet diurutkan manual).
    const keyRange = `${q(name)}!${columnLetter(keyCol)}:${columnLetter(keyCol)}`;
    const keys = (await this.readRaw([keyRange]))[keyRange];
    const data: { range: string; values: Cell[][] }[] = [];
    for (const u of updates) {
      const idx = keys.findIndex((r, i) => i > 0 && String(r?.[0] ?? '').trim() === u.key);
      if (idx < 0) throw new Error(`${keyHeader} "${u.key}" tidak ditemukan di sheet ${name}`);
      for (const [h, v] of Object.entries(u.patch)) {
        const c = headers.indexOf(h);
        if (c < 0) continue;
        data.push({ range: `${q(name)}!${columnLetter(c)}${idx + 1}`, values: [[v]] });
      }
    }
    if (!data.length) return;
    await this.call(`/values:batchUpdate`, { method: 'POST', body: { valueInputOption: 'RAW', data } });
  }

  /** Buat sheet yang belum ada dan pasang header (dipakai scripts/setup-sheet.ts). */
  async ensureSheets(headers: Record<string, readonly string[]>, seed: Record<string, Cell[][]> = {}): Promise<string[]> {
    const meta = await this.call<{ sheets: { properties: { title: string } }[] }>(`?fields=sheets.properties.title`);
    const existing = new Set(meta.sheets.map((s) => s.properties.title));
    const missing = Object.keys(headers).filter((n) => !existing.has(n));
    if (missing.length) {
      await this.call(`:batchUpdate`, {
        method: 'POST',
        body: { requests: missing.map((title) => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })) },
      });
    }
    const raw = await this.readRaw(Object.keys(headers));
    const data: { range: string; values: Cell[][] }[] = [];
    for (const [n, h] of Object.entries(headers)) {
      if ((raw[n] || []).length === 0) {
        data.push({ range: `${q(n)}!A1`, values: [[...h], ...(seed[n] || [])] });
      }
    }
    if (data.length) await this.call(`/values:batchUpdate`, { method: 'POST', body: { valueInputOption: 'RAW', data } });
    return data.map((d) => d.range);
  }
}
