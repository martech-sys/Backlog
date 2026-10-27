import type { SheetName } from '../config';
import type { Cell, Row, Store } from './types';

interface Table {
  headers: string[];
  rows: string[][];
}

/** Store di memori untuk mode demo dan pengujian. Data hilang saat server restart. */
export class MemoryStore implements Store {
  private tables = new Map<string, Table>();

  constructor(headers: Record<string, readonly string[]>, seed: Record<string, Cell[][]> = {}) {
    for (const [name, h] of Object.entries(headers)) {
      this.tables.set(name, {
        headers: [...h],
        rows: (seed[name] || []).map((r) => h.map((_, i) => (r[i] === undefined ? '' : String(r[i])))),
      });
    }
  }

  private table(name: string): Table {
    const t = this.tables.get(name);
    if (!t) throw new Error(`Sheet ${name} tidak ada`);
    return t;
  }

  async readAll(names: SheetName[]): Promise<Record<string, Row[]>> {
    const out: Record<string, Row[]> = {};
    for (const n of names) {
      const t = this.table(n);
      out[n] = t.rows.map((vals, i) => {
        const row = { _row: i + 2 } as Row;
        t.headers.forEach((h, c) => (row[h] = vals[c] ?? ''));
        return row;
      });
    }
    return out;
  }

  async append(name: SheetName, rows: Record<string, Cell>[]): Promise<void> {
    const t = this.table(name);
    for (const r of rows) t.rows.push(t.headers.map((h) => (h in r ? String(r[h]) : '')));
  }

  async update(
    name: SheetName,
    keyHeader: string,
    updates: { key: string; patch: Record<string, Cell> }[],
  ): Promise<void> {
    const t = this.table(name);
    const keyCol = t.headers.indexOf(keyHeader);
    if (keyCol < 0) throw new Error(`Kolom "${keyHeader}" tidak ditemukan di sheet ${name}`);
    for (const u of updates) {
      const row = t.rows.find((r) => r[keyCol] === u.key);
      if (!row) throw new Error(`${keyHeader} "${u.key}" tidak ditemukan di sheet ${name}`);
      for (const [h, v] of Object.entries(u.patch)) {
        const c = t.headers.indexOf(h);
        if (c >= 0) row[c] = String(v);
      }
    }
  }
}
