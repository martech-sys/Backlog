import {
  PERAN,
  type AppConfig,
  type BrandRow,
  type CategoryField,
  type ConfigRow,
  type GrupRow,
  type KategoriRow,
  type LiburRow,
  type Peran,
  type PicRow,
  type TimRow,
} from './config';
import { normalizeCellDate } from './dates';

export type Role = 'superadmin' | 'admin' | 'hocp' | 'head' | 'traffic' | 'lead' | 'tim' | 'pic' | 'viewer';

export interface Person {
  name: string;
  email: string;
  phone: string;
  grup: string; // Menswear | Womenswear | Semua
  peran: string;
  divisi: string;
  roles: Role[];
  isLead: boolean;
  isIntern: boolean;
  capacity: number;
  active: boolean;
  /** PIC brand: brand yang dipegang (kosong = semua brand di grupnya). */
  brands: string[];
  /** Tab asal: Master_Tim dan/atau Master_PIC. */
  sources: ('tim' | 'pic')[];
}

/** Peran kerja baku seseorang (untuk tampilan & form edit). */
export function peranOf(p: Pick<Person, 'roles' | 'isLead' | 'isIntern'>): Peran {
  if (p.roles.includes('hocp')) return PERAN.HOCP;
  if (p.roles.includes('head')) return PERAN.HEAD;
  if (p.roles.includes('traffic')) return PERAN.TRAFFIC;
  if (p.isLead || p.roles.includes('lead')) return PERAN.LEAD;
  if (p.roles.includes('pic') && !p.roles.includes('tim')) return PERAN.PIC;
  if (p.isIntern) return PERAN.INTERN;
  return PERAN.STAFF;
}

export interface Brand {
  name: string;
  code: string;
  grup: string;
  active: boolean;
}

export interface Grup {
  name: string;
  traffic: string;
  creativeHead: string;
}

export interface KategoriRule {
  kategori: string;
  subJenis: string[];
  divisi: string;
  leadMenswear: string;
  leadWomenswear: string;
  modeAssign: 'Lead pilih' | 'Otomatis beban' | 'Default';
  assigneeDefault: string;
  leadTimeMin: number;
  bufferReview: number;
  /** Kode akhiran ID task, mis. PE → CR-2611-001-PE */
  code: string;
  /** Otomatis beban: hanya anggota yang jabatannya memuat teks ini (kosong = semua anggota divisi). */
  filterPeran: string;
  /** Kolom isian form untuk kategori buatan web (null = kategori bawaan, kolomnya di kode). */
  fields: CategoryField[] | null;
  /** Kategori nonaktif tidak muncul di form & tidak dirouting, tapi riwayatnya tetap. */
  active: boolean;
}

export interface Master {
  config: AppConfig;
  grups: Grup[];
  brands: Brand[];
  people: Person[];
  kategori: KategoriRule[];
  holidays: Set<string>;
}

const yes = (v: string) => /^(ya|y|yes|true|1)$/i.test(String(v || '').trim());
const isActive = (v: string) => String(v || '').trim() === '' || yes(v);
const num = (v: string, fallback: number) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : fallback;
};

export function normalizePhone(raw: string): string {
  let p = String(raw || '').replace(/[^\d]/g, '');
  if (!p) return '';
  if (p.startsWith('0')) p = '62' + p.slice(1);
  else if (p.startsWith('8')) p = '62' + p;
  return p;
}

export function normalizeEmail(raw: string): string {
  return String(raw || '').trim().toLowerCase();
}

/**
 * "2,1,0" → [2, 1, 0]. Nilai di luar 0–30 diabaikan (mis. bila Sheets mengubah teks jadi
 * tanggal); bila tidak ada yang valid, pakai default H-2, H-1, hari H.
 */
export function parseReminderDays(raw: string): number[] {
  const days = String(raw || '')
    .split(/[,;\s]+/)
    .filter(Boolean)
    .map(Number)
    .filter((x) => Number.isInteger(x) && x >= 0 && x <= 30);
  return days.length ? [...new Set(days)] : [2, 1, 0];
}

export function parseConfig(rows: ConfigRow[]): AppConfig {
  const map = new Map(rows.map((r) => [String(r.Key).trim(), String(r.Value ?? '').trim()]));
  const get = (k: string, d: string) => (map.get(k) ? (map.get(k) as string) : d);
  return {
    ticketPrefix: get('TICKET_PREFIX', 'CR'),
    reminderDays: parseReminderDays(get('REMINDER_DAYS', '2,1,0')),
    maxRevisi: num(get('MAX_REVISI', '2'), 2),
    escalateAfterDays: num(get('ESCALATE_AFTER_DAYS', '1'), 1),
    adminEmails: get('ADMIN_EMAILS', '')
      .split(',')
      .map(normalizeEmail)
      .filter(Boolean),
    driveFolderUrl: get('DRIVE_FOLDER_URL', ''),
    waDryRun: /^(ya|true|1)$/i.test(get('WA_DRY_RUN', '')) ? true : /^(tidak|false|0)$/i.test(get('WA_DRY_RUN', '')) ? false : null,
  };
}

function rolesFromTim(r: TimRow): Role[] {
  const peran = String(r.Peran || '').toLowerCase();
  const roles: Role[] = [];
  if (peran.includes('head of creative production')) roles.push('hocp');
  else if (peran.includes('creative head')) roles.push('head');
  if (peran.includes('traffic')) roles.push('traffic');
  if (yes(r.Lead)) roles.push('lead');
  if (peran === 'admin') roles.push('admin');
  if (roles.length === 0) roles.push('tim');
  return roles;
}

export function buildMaster(input: {
  config: ConfigRow[];
  grup: GrupRow[];
  brand: BrandRow[];
  pic: PicRow[];
  tim: TimRow[];
  kategori: KategoriRow[];
  libur: LiburRow[];
}): Master {
  const config = parseConfig(input.config);

  const people: Person[] = [];
  const byName = new Map<string, Person>();
  const upsert = (p: Person) => {
    const key = p.name.toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      // Baris nonaktif (mis. peran lama setelah dipindah ke tab lain) tidak ikut menyumbang peran.
      if (existing.active && !p.active) {
        existing.email ||= p.email;
        existing.phone ||= p.phone;
        return;
      }
      if (!existing.active && p.active) {
        const keep = { email: existing.email, phone: existing.phone };
        Object.assign(existing, p, { email: p.email || keep.email, phone: p.phone || keep.phone });
        return;
      }
      // Orang yang sama di Master_Tim dan Master_PIC: gabungkan perannya.
      existing.roles = Array.from(new Set([...existing.roles, ...p.roles]));
      existing.email = existing.email || p.email;
      existing.phone = existing.phone || p.phone;
      existing.brands = existing.brands.length ? existing.brands : p.brands;
      existing.sources = Array.from(new Set([...existing.sources, ...p.sources]));
      existing.active = existing.active || p.active;
      return;
    }
    byName.set(key, p);
    people.push(p);
  };

  for (const r of input.tim) {
    if (!String(r.Nama || '').trim()) continue;
    upsert({
      name: String(r.Nama).trim(),
      email: normalizeEmail(r.Email),
      phone: normalizePhone(r['No WA']),
      grup: String(r.Grup || 'Semua').trim() || 'Semua',
      peran: String(r.Peran || '').trim(),
      divisi: String(r.Divisi || '').trim(),
      roles: rolesFromTim(r),
      isLead: yes(r.Lead),
      isIntern: yes(r.Intern) || /intern/i.test(r.Peran || ''),
      capacity: num(r.Kapasitas, 5),
      active: isActive(r.Aktif),
      brands: [],
      sources: ['tim'],
    });
  }
  for (const r of input.pic) {
    if (!String(r.Nama || '').trim()) continue;
    upsert({
      name: String(r.Nama).trim(),
      email: normalizeEmail(r.Email),
      phone: normalizePhone(r['No WA']),
      grup: String(r.Grup || '').trim(),
      peran: 'PIC Brand',
      divisi: 'Brand',
      roles: ['pic'],
      isLead: false,
      isIntern: false,
      capacity: 0,
      active: isActive(r.Aktif),
      brands: String(r.Brand || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      sources: ['pic'],
    });
  }
  for (const p of people) {
    if (p.email && config.adminEmails.includes(p.email) && !p.roles.includes('admin')) p.roles.push('admin');
  }

  const kategori: KategoriRule[] = input.kategori
    .filter((r) => String(r.Kategori || '').trim())
    .map((r) => {
      const mode = String(r['Mode Assign'] || '').trim();
      return {
        kategori: String(r.Kategori).trim(),
        subJenis: String(r['Sub-jenis'] || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        divisi: String(r.Divisi || '').trim(),
        leadMenswear: String(r['Lead Menswear'] || '').trim(),
        leadWomenswear: String(r['Lead Womenswear'] || '').trim(),
        modeAssign: (mode === 'Otomatis beban' || mode === 'Default' ? mode : 'Lead pilih') as KategoriRule['modeAssign'],
        assigneeDefault: String(r['Assignee Default'] || '').trim(),
        leadTimeMin: num(r['Lead Time Min (hari kerja)'], 3),
        bufferReview: num(r['Buffer Review (hari kerja)'], 1),
        code: String(r.Kode || '').trim().toUpperCase(),
        filterPeran: String(r['Filter Peran'] || '').trim(),
        fields: parseFieldForm(r['Field Form']),
        active: !/^(tidak|no|n|false|0)$/i.test(String(r.Aktif || '').trim()),
      };
    });

  return {
    config,
    grups: input.grup
      .filter((r) => String(r.Grup || '').trim())
      .map((r) => ({
        name: String(r.Grup).trim(),
        traffic: String(r.Traffic || '').trim(),
        creativeHead: String(r['Creative Head'] || '').trim(),
      })),
    brands: input.brand
      .filter((r) => String(r.Brand || '').trim())
      .map((r) => ({
        name: String(r.Brand).trim(),
        code: String(r.Kode || '').trim(),
        grup: String(r.Grup || '').trim(),
        active: isActive(r.Aktif),
      })),
    people,
    kategori,
    holidays: new Set(input.libur.map((r) => normalizeCellDate(r.Tanggal).slice(0, 10)).filter(Boolean)),
  };
}

export function findPerson(master: Master, name: string): Person | undefined {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return undefined;
  return master.people.find((p) => p.name.toLowerCase() === key);
}

export function findPersonByEmail(master: Master, email: string): Person | undefined {
  const e = normalizeEmail(email);
  if (!e) return undefined;
  return master.people.find((p) => p.email === e);
}

export function findPersonByPhone(master: Master, phone: string): Person | undefined {
  const p = normalizePhone(phone);
  if (!p) return undefined;
  return master.people.find((x) => x.phone === p);
}

export function grupOf(master: Master, grupName: string): Grup | undefined {
  return master.grups.find((g) => g.name.toLowerCase() === String(grupName || '').toLowerCase());
}

export function brandOf(master: Master, brandName: string): Brand | undefined {
  return master.brands.find((b) => b.name.toLowerCase() === String(brandName || '').toLowerCase());
}

/** Semua Creative Head + Head of Creative Production. */
export function heads(master: Master): Person[] {
  return master.people.filter((p) => p.active && (p.roles.includes('head') || p.roles.includes('hocp')));
}

const inGrup = (p: Person, grup: string) =>
  !grup || !p.grup || p.grup === 'Semua' || p.grup.toLowerCase() === String(grup).toLowerCase();

/**
 * Semua Traffic aktif untuk sebuah grup. Nama di Master_Grup diutamakan (tampil pertama)
 * selama orangnya masih aktif dan berperan Traffic; peran yang diubah di Kelola user langsung berlaku.
 */
export function trafficsFor(master: Master, grup: string): Person[] {
  const list = master.people.filter((p) => p.active && p.roles.includes('traffic') && inGrup(p, grup));
  const preferred = grupOf(master, grup)?.traffic.toLowerCase();
  return list.sort((a, b) => Number(b.name.toLowerCase() === preferred) - Number(a.name.toLowerCase() === preferred));
}

/** Creative Head untuk grup (nama Master_Grup diutamakan bila masih berperan Creative Head). */
export function headsFor(master: Master, grup: string): Person[] {
  const list = master.people.filter((p) => p.active && p.roles.includes('head') && inGrup(p, grup));
  const preferred = grupOf(master, grup)?.creativeHead.toLowerCase();
  return list.sort((a, b) => Number(b.name.toLowerCase() === preferred) - Number(a.name.toLowerCase() === preferred));
}

/**
 * Lead untuk divisi & grup. Nama di Master_Kategori dipakai bila orangnya masih aktif sebagai lead;
 * bila tidak, dicari lead lain di divisi & grup yang sama (peran yang diubah di Kelola user).
 */
export function leadFor(master: Master, divisi: string, grup: string, preferred = ''): string {
  const pref = findPerson(master, preferred);
  if (pref && pref.active && (pref.isLead || pref.roles.includes('lead'))) return pref.name;
  const alt = master.people.find(
    (p) => p.active && (p.isLead || p.roles.includes('lead')) && p.divisi.toLowerCase() === divisi.toLowerCase() && inGrup(p, grup),
  );
  return alt?.name || preferred;
}

const FIELD_TYPES = ['text', 'number', 'select', 'textarea'];

/** Baca kolom "Field Form" (JSON) dengan aman; data rusak diabaikan. */
export function parseFieldForm(raw: unknown): CategoryField[] | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  try {
    const arr = JSON.parse(text) as unknown;
    if (!Array.isArray(arr)) return null;
    return arr
      .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
      .map((f) => ({
        key: String(f.key || '').trim(),
        label: String(f.label || '').trim(),
        type: (FIELD_TYPES.includes(String(f.type)) ? f.type : 'text') as CategoryField['type'],
        required: f.required === true,
        options: Array.isArray(f.options) ? f.options.map((o) => String(o).trim()).filter(Boolean) : undefined,
      }))
      .filter((f) => f.key && f.label);
  } catch {
    return null;
  }
}
