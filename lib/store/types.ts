import type { SheetName } from '../config';

export type Cell = string | number;
export type Row = Record<string, string> & { _row: number };

/** Abstraksi penyimpanan tabel. Implementasi: Google Sheets (produksi) dan memori (demo/test). */
export interface Store {
  /**
   * Baca beberapa sheet sekaligus. Nilai sel selalu dikembalikan sebagai string.
   * `fresh: true` melewati cache baca (dipakai sebelum menulis).
   */
  readAll(names: SheetName[], opts?: { fresh?: boolean }): Promise<Record<string, Row[]>>;
  /** Tambah baris; kunci objek = nama header. Kolom yang tidak dikenal diabaikan. */
  append(name: SheetName, rows: Record<string, Cell>[]): Promise<void>;
  /** Ubah sel-sel pada baris yang kolom `keyHeader`-nya = key. */
  update(name: SheetName, keyHeader: string, updates: { key: string; patch: Record<string, Cell> }[]): Promise<void>;
  /** Hapus baris yang nilai kolom `column`-nya memenuhi `match`. Mengembalikan jumlah baris terhapus. */
  deleteWhere(name: SheetName, column: string, match: (value: string) => boolean): Promise<number>;
}
