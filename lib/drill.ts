/**
 * Drill-down dari dashboard: filter dashboard ikut dibawa ke halaman tujuan lewat URL
 * (bisa dibagikan / dibuka di tab baru) dan bisa dikembalikan dengan "Kembali ke dashboard".
 */
export const DASH_KEYS = ['periode', 'from', 'to', 'grup', 'brand', 'divisi', 'anggota', 'kategori'] as const;

type SP = Record<string, string | undefined>;

/** Query string filter dashboard saat ini (untuk tombol kembali). */
export function dashQuery(sp: SP): string {
  return new URLSearchParams(DASH_KEYS.filter((k) => sp[k]).map((k) => [k, sp[k]!])).toString();
}

/** Link drill-down ke `path` dengan filter `params` (nilai kosong diabaikan). */
export function drill(path: string, params: Record<string, string | undefined>, dash: string): string {
  const p = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  p.set('src', 'dash');
  if (dash) p.set('dash', dash);
  return `${path}?${p}`;
}

/** URL halaman yang sama tanpa satu filter (untuk tombol × di chip). */
export function without(path: string, sp: SP, key: string | string[]): string {
  const drop = new Set(['ok', 'err', ...(Array.isArray(key) ? key : [key])]);
  const p = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && !drop.has(k)) as [string, string][]);
  const qs = p.toString();
  return qs ? `${path}?${qs}` : path;
}

const inDay = (ts: string) => String(ts || '').slice(0, 10);

/** Cocokkan tanggal (YYYY-MM-DD…) dengan rentang from/to yang boleh kosong. */
export function inPeriod(ts: string, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  const d = inDay(ts);
  return !!d && (!from || d >= from) && (!to || d <= to);
}
