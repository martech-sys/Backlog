/**
 * Mengubah data kerja seseorang (peran, sisi, divisi, brand, No WA, email) dari halaman Kelola user.
 * Datanya ditulis ke Master_Tim / Master_PIC — sumber yang sama dengan yang dipakai routing dan notifikasi —
 * sehingga perubahan langsung berlaku untuk request & notifikasi berikutnya.
 */
import { DIVISI, PERAN, PERAN_DENGAN_DIVISI, PERAN_LIST, SHEETS, SISI, type Peran } from './config';
import { now } from './clock';
import { formatWib } from './dates';
import { normalizeEmail, normalizePhone, peranOf, type Master, type Person } from './master';
import type { Cell, Row, Store } from './store';

export interface WorkProfile {
  nama: string;
  peran: Peran | '';
  sisi: string;
  divisi: string;
  /** Jabatan spesifik, mis. "Photo Editor" (opsional; dipakai filter auto-assign). */
  jabatan: string;
  /** PIC brand: brand yang dipegang. */
  brands: string[];
  phone: string;
  kapasitas: string;
}

export interface SaveResult {
  ok: boolean;
  message: string;
}

const divisiLabel = (v: string) => DIVISI.find((d) => d.value === v)?.label || v;
const ROLE_TITLES = /^(head of creative production|creative head|traffic|lead\b|intern\b|staff$|admin$|pic brand$)/i;

/** Validasi profil kerja. Peran boleh kosong hanya bila `allowEmpty` (Admin/Superadmin). */
export function validateProfile(p: WorkProfile, allowEmpty: boolean, brandNames: string[] = []): string | null {
  if (!p.nama.trim()) return 'Nama wajib diisi.';
  if (!p.peran) return allowEmpty ? null : 'Peran kerja wajib dipilih untuk akses User.';
  if (!PERAN_LIST.includes(p.peran)) return 'Peran kerja tidak dikenal.';
  if (!(SISI as readonly string[]).includes(p.sisi)) return 'Pilih sisi: Menswear, Womenswear, atau Semua.';
  if (PERAN_DENGAN_DIVISI.includes(p.peran) && !DIVISI.some((d) => d.value === p.divisi)) {
    return `Pilih divisi untuk peran ${p.peran}.`;
  }
  const unknown = p.brands.filter((b) => brandNames.length && !brandNames.includes(b));
  if (unknown.length) return `Brand tidak dikenal: ${unknown.join(', ')}`;
  if (p.phone && normalizePhone(p.phone).length < 9) return 'Nomor WA tidak valid.';
  return null;
}

/** Ringkasan satu baris untuk log & tampilan, mis. "Lead · Foto · Menswear". */
export function describe(p: Pick<WorkProfile, 'peran' | 'divisi' | 'sisi' | 'brands'> | null): string {
  if (!p || !p.peran) return '(tanpa peran kerja)';
  const parts: string[] = [p.peran];
  if (PERAN_DENGAN_DIVISI.includes(p.peran as Peran) && p.divisi) parts.push(divisiLabel(p.divisi));
  if (p.sisi) parts.push(p.sisi);
  if (p.peran === PERAN.PIC && p.brands.length) parts.push(p.brands.join(', '));
  return parts.join(' · ');
}

/** Profil kerja saat ini dari master data (untuk mengisi form). */
export function profileOf(person: Person | undefined, fallbackName = ''): WorkProfile {
  if (!person) return { nama: fallbackName, peran: '', sisi: 'Semua', divisi: '', jabatan: '', brands: [], phone: '', kapasitas: '' };
  const peran = peranOf(person);
  return {
    nama: person.name,
    peran,
    sisi: person.grup || 'Semua',
    divisi: PERAN_DENGAN_DIVISI.includes(peran) ? person.divisi : '',
    jabatan: ROLE_TITLES.test(person.peran) ? '' : person.peran,
    brands: person.brands,
    phone: person.phone,
    kapasitas: person.capacity ? String(person.capacity) : '',
  };
}

function findRow(rows: Row[], email: string, names: string[]): Row | undefined {
  const e = normalizeEmail(email);
  const wanted = names.map((n) => n.trim().toLowerCase()).filter(Boolean);
  return (
    (e && rows.find((r) => normalizeEmail(r.Email) === e)) ||
    rows.find((r) => wanted.includes(String(r.Nama || '').trim().toLowerCase()))
  );
}

/**
 * Simpan profil kerja ke Master_Tim / Master_PIC. Baris dicari berdasarkan email (lalu nama lama/baru);
 * peran PIC ditulis ke Master_PIC, peran lain ke Master_Tim. Baris di tab yang tidak lagi relevan
 * dinonaktifkan (tidak dihapus, agar riwayat tetap utuh).
 */
export async function saveProfile(
  store: Store,
  params: { email: string; oldName?: string; profile: WorkProfile; by: string },
): Promise<SaveResult & { from: string; to: string }> {
  const { profile: p, email } = params;
  const t = await store.readAll([SHEETS.TIM, SHEETS.PIC], { fresh: true });
  const names = [params.oldName || '', p.nama];
  const timRow = findRow(t[SHEETS.TIM], email, names);
  const picRow = findRow(t[SHEETS.PIC], email, names);

  const before = timRow && String(timRow.Aktif || 'Ya') !== 'Tidak' ? describeRow(timRow, 'tim') : picRow ? describeRow(picRow, 'pic') : '(tanpa peran kerja)';
  const phone = normalizePhone(p.phone);
  const mail = normalizeEmail(email);

  if (!p.peran) return { ok: true, message: 'Tanpa peran kerja.', from: before, to: before };

  if (p.peran === PERAN.PIC) {
    const patch: Record<string, Cell> = {
      Nama: p.nama.trim(),
      Grup: p.sisi,
      Email: mail,
      'No WA': phone,
      Aktif: 'Ya',
      Brand: p.brands.join(', '),
    };
    if (picRow) await store.update(SHEETS.PIC, 'Nama', [{ key: picRow.Nama, patch }]);
    else await store.append(SHEETS.PIC, [patch]);
    if (timRow && timRow.Aktif !== 'Tidak') await store.update(SHEETS.TIM, 'Nama', [{ key: timRow.Nama, patch: { Aktif: 'Tidak' } }]);
  } else {
    const existingTitle = String(timRow?.Peran || '').trim();
    const keepTitle = existingTitle && !ROLE_TITLES.test(existingTitle) ? existingTitle : '';
    const title =
      p.peran === PERAN.HOCP || p.peran === PERAN.HEAD || p.peran === PERAN.TRAFFIC
        ? p.peran
        : p.jabatan.trim() ||
          (p.peran === PERAN.LEAD ? `Lead ${divisiLabel(p.divisi)}` : p.peran === PERAN.INTERN ? `Intern ${divisiLabel(p.divisi)}` : keepTitle || 'Staff');
    const divisi =
      p.peran === PERAN.HOCP || p.peran === PERAN.HEAD ? 'Management' : p.peran === PERAN.TRAFFIC ? 'Traffic' : p.divisi;
    const kapasitas = p.kapasitas.trim() || String(timRow?.Kapasitas || '') || (p.peran === PERAN.INTERN ? '2' : PERAN_DENGAN_DIVISI.includes(p.peran) ? '5' : '');
    const patch: Record<string, Cell> = {
      Nama: p.nama.trim(),
      Peran: title,
      Divisi: divisi,
      Grup: p.sisi,
      Lead: p.peran === PERAN.LEAD ? 'Ya' : 'Tidak',
      Intern: p.peran === PERAN.INTERN ? 'Ya' : 'Tidak',
      Kapasitas: kapasitas,
      'No WA': phone,
      Email: mail,
      Aktif: 'Ya',
    };
    if (timRow) await store.update(SHEETS.TIM, 'Nama', [{ key: timRow.Nama, patch }]);
    else await store.append(SHEETS.TIM, [patch]);
    if (picRow && picRow.Aktif !== 'Tidak') await store.update(SHEETS.PIC, 'Nama', [{ key: picRow.Nama, patch: { Aktif: 'Tidak' } }]);
  }

  const after = describe(p);
  return { ok: true, message: 'Peran kerja disimpan.', from: before, to: after };
}

function describeRow(r: Row, kind: 'tim' | 'pic'): string {
  if (kind === 'pic') return describe({ peran: PERAN.PIC, divisi: '', sisi: r.Grup || 'Semua', brands: String(r.Brand || '').split(',').map((x) => x.trim()).filter(Boolean) });
  const title = String(r.Peran || '');
  const peran: Peran = /head of creative production/i.test(title)
    ? PERAN.HOCP
    : /creative head/i.test(title)
      ? PERAN.HEAD
      : /traffic/i.test(title)
        ? PERAN.TRAFFIC
        : /^(ya|y|true)$/i.test(r.Lead || '')
          ? PERAN.LEAD
          : /^(ya|y|true)$/i.test(r.Intern || '')
            ? PERAN.INTERN
            : PERAN.STAFF;
  return describe({ peran, divisi: r.Divisi || '', sisi: r.Grup || 'Semua', brands: [] });
}

/** Ganti email di baris master data (agar akun & orang tetap tertaut). */
export async function renameEmailInMaster(store: Store, oldEmail: string, newEmail: string): Promise<void> {
  const o = normalizeEmail(oldEmail);
  const t = await store.readAll([SHEETS.TIM, SHEETS.PIC], { fresh: true });
  for (const [sheet, rows] of [
    [SHEETS.TIM, t[SHEETS.TIM]],
    [SHEETS.PIC, t[SHEETS.PIC]],
  ] as const) {
    const hits = rows.filter((r) => normalizeEmail(r.Email) === o);
    if (hits.length) await store.update(sheet, 'Nama', hits.map((r) => ({ key: r.Nama, patch: { Email: normalizeEmail(newEmail) } })));
  }
}

/** Catat perubahan oleh admin ke tab Log_Admin. */
export async function logAdmin(store: Store, row: { by: string; aksi: string; target: string; dari: string; ke: string }) {
  await store.append(SHEETS.LOG_ADMIN, [
    { Timestamp: formatWib(now()), Oleh: row.by, Aksi: row.aksi, Target: row.target, Dari: row.dari, Ke: row.ke },
  ]);
}

/** Orang di master data yang cocok dengan nama (untuk isi otomatis form Tambah user). */
export function masterSuggestions(master: Master): { nama: string; email: string; profile: WorkProfile }[] {
  return master.people.filter((x) => x.active).map((x) => ({ nama: x.name, email: x.email, profile: profileOf(x) }));
}

/** Ganti No WA seseorang di semua baris master miliknya (dicari lewat email, lalu nama). */
export async function setPhone(store: Store, email: string, name: string, phone: string): Promise<SaveResult & { from: string }> {
  const t = await store.readAll([SHEETS.TIM, SHEETS.PIC], { fresh: true });
  let from = '';
  let hit = false;
  for (const sheet of [SHEETS.TIM, SHEETS.PIC] as const) {
    const row = findRow(t[sheet], email, [name]);
    if (!row) continue;
    from ||= String(row['No WA'] || '');
    hit = true;
    await store.update(sheet, 'Nama', [{ key: row.Nama, patch: { 'No WA': phone } }]);
  }
  if (!hit) return { ok: false, message: 'Akunmu belum terhubung ke data tim/PIC. Minta superadmin mengisi peran kerjamu dulu.', from };
  return { ok: true, message: phone ? `Nomor WA disimpan: ${phone}.` : 'Nomor WA dikosongkan; kamu tidak akan menerima notifikasi WA.', from };
}
