import type {
  AppConfig,
  BrandRow,
  ConfigRow,
  GrupRow,
  KategoriRow,
  LiburRow,
  PicRow,
  TimRow,
} from './config';
import { normalizeCellDate } from './dates';

export type Role = 'admin' | 'hocp' | 'head' | 'traffic' | 'lead' | 'tim' | 'pic' | 'viewer';

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

export function parseConfig(rows: ConfigRow[]): AppConfig {
  const map = new Map(rows.map((r) => [String(r.Key).trim(), String(r.Value ?? '').trim()]));
  const get = (k: string, d: string) => (map.get(k) ? (map.get(k) as string) : d);
  return {
    ticketPrefix: get('TICKET_PREFIX', 'CR'),
    reminderDays: get('REMINDER_DAYS', '2,1,0')
      .split(',')
      .map((x) => Number(x.trim()))
      .filter((x) => Number.isFinite(x)),
    maxRevisi: num(get('MAX_REVISI', '2'), 2),
    escalateAfterDays: num(get('ESCALATE_AFTER_DAYS', '1'), 1),
    adminEmails: get('ADMIN_EMAILS', '')
      .split(',')
      .map(normalizeEmail)
      .filter(Boolean),
    driveFolderUrl: get('DRIVE_FOLDER_URL', ''),
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
      // Orang yang sama di Master_Tim dan Master_PIC: gabungkan perannya.
      existing.roles = Array.from(new Set([...existing.roles, ...p.roles]));
      existing.email = existing.email || p.email;
      existing.phone = existing.phone || p.phone;
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
