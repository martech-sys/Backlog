/**
 * Kelola kategori dari web (Admin/Superadmin): tambah kategori baru beserta kolom isian form-nya,
 * ubah aturan routing kategori yang ada, atau nonaktifkan. Data tetap di sheet Master_Kategori.
 */
import { fieldKey } from './categories';
import { CATEGORIES, CUSTOM_CATEGORY, DIVISI, SHEETS, type CategoryField } from './config';
import { loadDb } from './db';
import { findPerson } from './master';
import { logAdmin } from './people';
import type { Cell, Store } from './store';
import type { CurrentUser } from './workflow';

export const MODE_ASSIGN = ['Lead pilih', 'Otomatis beban', 'Default'] as const;
export const FIELD_TYPE_LABEL: Record<string, string> = { text: 'Teks singkat', textarea: 'Teks panjang', number: 'Angka', select: 'Pilihan' };
const MAX_FIELDS = 12;

export interface KategoriInput {
  /** Kode baris yang diedit; kosong = tambah kategori baru. */
  originalCode: string;
  name: string;
  code: string;
  divisi: string;
  leadMenswear: string;
  leadWomenswear: string;
  modeAssign: string;
  assigneeDefault: string;
  leadTimeMin: string;
  bufferReview: string;
  subJenis: string;
  filterPeran: string;
  fields: { key?: string; label: string; type: string; required?: boolean; options?: string[] | string }[];
  aktif: boolean;
}

export const canManageKategori = (u: CurrentUser) => u.roles.includes('admin') || u.roles.includes('superadmin');
export const isBuiltInKategori = (name: string) => CATEGORIES.some((c) => c.name === name);

function cleanFields(raw: KategoriInput['fields']): { fields: CategoryField[]; error?: string } {
  if (raw.length > MAX_FIELDS) return { fields: [], error: `Maksimal ${MAX_FIELDS} kolom isian.` };
  const taken: string[] = [];
  const fields: CategoryField[] = [];
  for (const [i, f] of raw.entries()) {
    const label = String(f.label || '').trim();
    if (!label) return { fields: [], error: `Kolom isian ke-${i + 1}: label wajib diisi.` };
    if (label.length > 40) return { fields: [], error: `Label "${label}" terlalu panjang (maks. 40 karakter).` };
    if (/[;:]/.test(label)) return { fields: [], error: `Label "${label}" tidak boleh memakai tanda ; atau :` };
    if (fields.some((x) => x.label.toLowerCase() === label.toLowerCase())) return { fields: [], error: `Label "${label}" dipakai dua kali.` };
    const type = ['text', 'textarea', 'number', 'select'].includes(f.type) ? (f.type as CategoryField['type']) : 'text';
    const options = (Array.isArray(f.options) ? f.options : String(f.options || '').split(','))
      .map((o) => String(o).trim())
      .filter(Boolean);
    if (type === 'select' && options.length < 2) return { fields: [], error: `Kolom "${label}" bertipe pilihan butuh minimal 2 pilihan.` };
    const key = f.key && /^[a-z0-9_]{1,40}$/.test(f.key) && !taken.includes(f.key) ? f.key : fieldKey(label, taken);
    taken.push(key);
    fields.push({ key, label, type, required: !!f.required, ...(type === 'select' ? { options } : {}) });
  }
  return { fields };
}

/** Tambah atau ubah satu baris aturan kategori. */
export async function saveKategori(store: Store, user: CurrentUser, p: KategoriInput): Promise<{ ok: boolean; message: string }> {
  if (!canManageKategori(user)) return { ok: false, message: 'Hanya Admin atau Superadmin yang bisa mengelola kategori.' };
  const db = await loadDb(store, { fresh: true });
  const rules = db.master.kategori;
  const editing = p.originalCode ? rules.find((r) => r.code === p.originalCode.toUpperCase()) : undefined;
  if (p.originalCode && !editing) return { ok: false, message: 'Kategori yang diubah tidak ditemukan (kode berubah?). Muat ulang halaman.' };

  const name = editing ? editing.kategori : p.name.trim().replace(/\s+/g, ' ');
  const code = editing ? editing.code : p.code.trim().toUpperCase();
  if (!editing) {
    if (!name) return { ok: false, message: 'Nama kategori wajib diisi.' };
    if (name.length > 40 || /[,]/.test(name)) return { ok: false, message: 'Nama kategori maks. 40 karakter dan tanpa koma.' };
    if (rules.some((r) => r.kategori.toLowerCase() === name.toLowerCase()) || name.toLowerCase() === CUSTOM_CATEGORY.toLowerCase())
      return { ok: false, message: `Kategori "${name}" sudah ada.` };
    if (!/^[A-Z0-9]{1,4}$/.test(code)) return { ok: false, message: 'Kode wajib 1–4 huruf/angka, mis. BM.' };
    if (rules.some((r) => r.code === code)) return { ok: false, message: `Kode ${code} sudah dipakai kategori lain.` };
  }
  const builtIn = isBuiltInKategori(name);
  const isCustomCat = name === CUSTOM_CATEGORY;

  const divisi = isCustomCat ? '' : p.divisi.trim();
  if (!isCustomCat && !DIVISI.some((d) => d.value === divisi)) return { ok: false, message: 'Pilih divisi.' };
  for (const lead of [p.leadMenswear, p.leadWomenswear].map((x) => x.trim()).filter(Boolean)) {
    const person = findPerson(db.master, lead);
    if (!person || !person.active) return { ok: false, message: `Lead "${lead}" tidak ditemukan atau tidak aktif.` };
  }
  const mode = (MODE_ASSIGN as readonly string[]).includes(p.modeAssign) ? p.modeAssign : 'Lead pilih';
  const assigneeDefault = mode === 'Default' ? p.assigneeDefault.trim() : '';
  if (mode === 'Default') {
    const person = findPerson(db.master, assigneeDefault);
    if (!person || !person.active) return { ok: false, message: 'Mode Default butuh assignee default yang aktif.' };
  }
  const leadTime = Number(p.leadTimeMin);
  const buffer = Number(p.bufferReview);
  if (!Number.isInteger(leadTime) || leadTime < 0 || leadTime > 60) return { ok: false, message: 'Lead time minimum 0–60 hari kerja.' };
  if (!Number.isInteger(buffer) || buffer < 0 || buffer > 10) return { ok: false, message: 'Buffer review 0–10 hari kerja.' };
  const subs = [...new Set(p.subJenis.split(',').map((x) => x.trim()).filter(Boolean))];
  if (!subs.length) return { ok: false, message: 'Isi minimal satu sub-jenis (pisahkan dengan koma).' };

  let fieldForm = '';
  if (!builtIn) {
    const { fields, error } = cleanFields(p.fields);
    if (error) return { ok: false, message: error };
    fieldForm = JSON.stringify(fields);
  }
  if (isCustomCat && !p.aktif) return { ok: false, message: 'Kategori Lainnya (custom) tidak bisa dinonaktifkan.' };

  const row: Record<string, Cell> = {
    Kategori: name,
    'Sub-jenis': isCustomCat ? 'Custom' : subs.join(', '),
    Divisi: divisi,
    'Lead Menswear': p.leadMenswear.trim(),
    'Lead Womenswear': p.leadWomenswear.trim(),
    'Mode Assign': mode,
    'Assignee Default': assigneeDefault,
    'Lead Time Min (hari kerja)': leadTime,
    'Buffer Review (hari kerja)': buffer,
    Kode: code,
    'Filter Peran': p.filterPeran.trim(),
    'Field Form': fieldForm,
    Aktif: p.aktif ? 'Ya' : 'Tidak',
  };

  if (editing) {
    // Sub-jenis berlaku untuk semua baris kategori yang sama (mis. Fotoshoot: Foto & Styling).
    const siblings = rules.filter((r) => r.kategori === name && r.code && r.code !== code);
    await store.update(SHEETS.KATEGORI, 'Kode', [
      { key: code, patch: row },
      ...siblings.map((r) => ({ key: r.code, patch: { 'Sub-jenis': row['Sub-jenis'], ...(builtIn ? {} : { 'Field Form': fieldForm }) } })),
    ]);
    await logAdmin(store, {
      by: user.name,
      aksi: 'Ubah kategori',
      target: `${name} (${code})`,
      dari: `${editing.divisi} · lead ${editing.leadMenswear || '-'}/${editing.leadWomenswear || '-'} · ${editing.leadTimeMin} hari${editing.active ? '' : ' · nonaktif'}`,
      ke: `${divisi} · lead ${row['Lead Menswear'] || '-'}/${row['Lead Womenswear'] || '-'} · ${leadTime} hari${p.aktif ? '' : ' · nonaktif'}`,
    });
    return { ok: true, message: `Kategori ${name} (${code}) disimpan.` };
  }
  await store.append(SHEETS.KATEGORI, [row]);
  await logAdmin(store, { by: user.name, aksi: 'Tambah kategori', target: `${name} (${code})`, dari: '', ke: `${divisi} · ${subs.join(', ')}` });
  return { ok: true, message: `Kategori ${name} ditambahkan dengan kode ${code}. Langsung tersedia di form Request baru.` };
}
