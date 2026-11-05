import Link from 'next/link';
import { without } from '@/lib/drill';

/**
 * Chip filter aktif (tiap chip bisa dihapus dengan ×) + tombol kembali ke dashboard bila
 * halaman dibuka dari drill-down dashboard.
 */
export function FilterChips({
  path,
  sp,
  labels,
  format = (_k, v) => v,
}: {
  path: string;
  sp: Record<string, string | undefined>;
  labels: Record<string, string>;
  format?: (key: string, value: string) => string;
}) {
  const active = Object.keys(labels).filter((k) => sp[k]);
  const fromDash = sp.src === 'dash';
  if (!active.length && !fromDash) return null;
  return (
    <div className="chips" aria-label="Filter aktif">
      {fromDash ? (
        <Link className="btn small" href={`/dashboard${sp.dash ? `?${sp.dash}` : ''}`}>
          ← Kembali ke dashboard
        </Link>
      ) : null}
      {active.map((k) => (
        <span className="chip" key={k}>
          {labels[k]}: <b>{format(k, sp[k]!)}</b>
          <Link
            href={without(path, sp, k === 'from' || k === 'to' ? ['from', 'to', 'periode'] : k)}
            aria-label={`Hapus filter ${labels[k]}`}
          >
            ×
          </Link>
        </span>
      ))}
      {active.length > 1 ? (
        <Link className="subtle" href={without(path, sp, active.concat('periode'))}>
          Hapus semua filter
        </Link>
      ) : null}
    </div>
  );
}
