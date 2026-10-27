/**
 * Utilitas tanggal. Semua tanggal disimpan sebagai teks WIB:
 *   - tanggal      : "YYYY-MM-DD"
 *   - tanggal+jam  : "YYYY-MM-DD HH:mm"
 * Aritmetika hari dilakukan di UTC agar tidak terpengaruh zona waktu server.
 */

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "YYYY-MM-DD HH:mm" dalam WIB. */
export function formatWib(d: Date): string {
  const w = new Date(d.getTime() + WIB_OFFSET_MS);
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())} ${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`;
}

/** "YYYY-MM-DD" hari ini dalam WIB. */
export function todayWib(now: Date = new Date()): string {
  return formatWib(now).slice(0, 10);
}

/** Jam WIB (0–23). */
export function hourWib(now: Date = new Date()): number {
  return new Date(now.getTime() + WIB_OFFSET_MS).getUTCHours();
}

export function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function ymdToUtc(ymd: string): number {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcToYmd(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(ymd: string, n: number): string {
  return utcToYmd(ymdToUtc(ymd) + n * DAY_MS);
}

/** Selisih hari kalender: to - from. */
export function diffDays(from: string, to: string): number {
  return Math.round((ymdToUtc(to) - ymdToUtc(from)) / DAY_MS);
}

/** 0 = Minggu … 6 = Sabtu */
export function dayOfWeek(ymd: string): number {
  return new Date(ymdToUtc(ymd)).getUTCDay();
}

export function isWorkingDay(ymd: string, holidays: Set<string>): boolean {
  const dow = dayOfWeek(ymd);
  return dow !== 0 && dow !== 6 && !holidays.has(ymd);
}

/** Tambah (atau kurangi bila n negatif) n hari kerja. */
export function addWorkingDays(ymd: string, n: number, holidays: Set<string>): string {
  let cur = ymd;
  let left = Math.abs(n);
  const step = n >= 0 ? 1 : -1;
  while (left > 0) {
    cur = addDays(cur, step);
    if (isWorkingDay(cur, holidays)) left--;
  }
  return cur;
}

/** Jumlah hari kerja d dengan from < d <= to. Negatif bila to sebelum from. */
export function workingDaysBetween(from: string, to: string, holidays: Set<string>): number {
  if (to === from) return 0;
  const sign = to > from ? 1 : -1;
  const [a, b] = sign > 0 ? [from, to] : [to, from];
  let count = 0;
  for (let cur = addDays(a, 1); cur <= b; cur = addDays(cur, 1)) {
    if (isWorkingDay(cur, holidays)) count++;
  }
  return sign * count;
}

/** Epoch ms dari teks WIB "YYYY-MM-DD[ HH:mm]". NaN bila tidak valid. */
export function wibToMs(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s || '');
  if (!m) return NaN;
  const [, y, mo, d, h = '0', mi = '0'] = m;
  return Date.UTC(+y, +mo - 1, +d, +h, +mi) - WIB_OFFSET_MS;
}

/** Selisih dalam hari (pecahan) antara dua timestamp WIB. */
export function daysBetweenTimestamps(from: string, to: string): number {
  const a = wibToMs(from);
  const b = wibToMs(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, (b - a) / DAY_MS);
}

/**
 * Normalisasi nilai sel dari Google Sheets ke teks WIB.
 * Menerima serial number Sheets (zona waktu spreadsheet = Asia/Jakarta),
 * "YYYY-MM-DD[ HH:mm[:ss]]", atau format lokal "DD/MM/YYYY[ HH:mm[:ss]]".
 */
export function normalizeCellDate(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    const ms = Math.round((v - 25569) * DAY_MS); // 25569 = 1970-01-01 dalam serial Sheets
    const d = new Date(ms);
    const ymd = utcToYmd(ms);
    const hasTime = v % 1 !== 0;
    return hasTime ? `${ymd} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : ymd;
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (m) {
    const ymd = `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
    return m[4] ? `${ymd} ${pad(+m[4])}:${m[5]}` : ymd;
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2})[:.](\d{2}))?/.exec(s);
  if (m) {
    const ymd = `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
    return m[4] ? `${ymd} ${pad(+m[4])}:${m[5]}` : ymd;
  }
  return s;
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

/** "Sen, 27 Okt 2026" */
export function formatTanggal(ymd: string, withDay = true): string {
  if (!isYmd(ymd.slice(0, 10))) return ymd || '-';
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  const base = `${d} ${BULAN[m - 1]} ${y}`;
  return withDay ? `${HARI[dayOfWeek(ymd)]}, ${base}` : base;
}

/** "27 Okt, 14:05" */
export function formatWaktu(ts: string): string {
  if (!ts) return '-';
  const [ymd, hm] = ts.split(' ');
  if (!isYmd(ymd)) return ts;
  const [, m, d] = ymd.split('-').map(Number);
  return `${d} ${BULAN[m - 1]}${hm ? `, ${hm}` : ''}`;
}

/** Label sisa hari: "Hari ini", "2 hari lagi", "Lewat 3 hari". */
export function sisaLabel(days: number): string {
  if (days === 0) return 'Hari ini';
  if (days > 0) return `${days} hari lagi`;
  return `Lewat ${-days} hari`;
}
