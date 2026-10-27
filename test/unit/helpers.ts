import { HEADERS, SEED, SHEETS } from '../../lib/config';
import { setClock } from '../../lib/clock';
import { loadDb } from '../../lib/db';
import { findPerson } from '../../lib/master';
import type { RequestInput } from '../../lib/service';
import { MemoryStore } from '../../lib/store/memory';
import type { Cell } from '../../lib/store/types';
import { userFromPerson } from '../../lib/users';

/** Store berisi master data dari dokumen + beberapa anggota & nomor WA untuk pengujian. */
export function testStore(): MemoryStore {
  const seed: Record<string, Cell[][]> = {};
  for (const [k, v] of Object.entries(SEED)) seed[k] = (v || []).map((r) => [...r]);
  let n = 0;
  const phone = () => `6281100000${String(++n).padStart(2, '0')}`;
  seed[SHEETS.TIM] = [
    ...seed[SHEETS.TIM],
    ['Desainer A', 'Graphic Designer', 'Desain', 'Semua', 'Tidak', 'Tidak', 4],
    ['Desainer B', 'Graphic Designer', 'Desain', 'Semua', 'Tidak', 'Tidak', 4],
    ['Videografer A', 'Videographer', 'Video', 'Semua', 'Tidak', 'Tidak', 3],
  ].map((r) => {
    const row = [...r];
    while (row.length < 10) row.push('');
    row[7] = phone();
    row[8] = `${String(row[0]).toLowerCase().replace(/\s+/g, '.')}@heymale.id`;
    row[9] = 'Ya';
    return row;
  });
  seed[SHEETS.PIC] = seed[SHEETS.PIC].map((r) => [r[0], r[1], `${String(r[0]).toLowerCase()}@heymale.id`, phone(), 'Ya']);
  return new MemoryStore(HEADERS, seed);
}

export async function userOf(store: MemoryStore, name: string) {
  const db = await loadDb(store);
  const p = findPerson(db.master, name);
  if (!p) throw new Error(`no person ${name}`);
  return userFromPerson(p);
}

export function at(iso: string) {
  setClock(new Date(iso));
}

export function requestInput(over: Partial<RequestInput> = {}): RequestInput {
  return {
    brand: 'Heymale',
    campaignName: 'Payday Sale',
    campaignType: 'Small Campaign',
    objective: 'Naikkan penjualan',
    kategori: ['Desain grafis'],
    subJenis: { 'Desain grafis': ['Poster', 'Banner'] },
    details: { 'Desain grafis': { ukuran: '1080x1350', jumlahDesain: '3', copy: '' } },
    usp: 'Bahan adem',
    keyMessage: 'Diskon 50%',
    creativeNote: 'Bold, kontras',
    targetAudience: 'Pria 20-30',
    budget: '1.500.000',
    dueDate: '2026-11-06',
    deliverables: 'Poster (2), Banner (1)',
    supportingLink: '',
    attachments: '',
    ...over,
  };
}
