import { diffDays, sisaLabel } from '@/lib/dates';

const STATUS_TONE: Record<string, string> = {
  Baru: 'blue',
  'Brief Kurang': 'amber',
  Diproses: 'blue',
  'Siap Assign': 'outline',
  Dikerjakan: 'blue',
  'QC Lead': 'violet',
  'Revisi Internal': 'amber',
  'Review Brand': 'violet',
  'Revisi Brand': 'amber',
  ACC: 'green',
  Final: 'green',
  Selesai: '',
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${STATUS_TONE[status] ?? ''}`}>{status || '-'}</span>;
}

export function UrgentBadge({ urgent }: { urgent: string | boolean }) {
  if (!(urgent === true || urgent === 'Ya')) return null;
  return <span className="badge red">URGENT</span>;
}

export function Sisa({ deadline, today, done }: { deadline: string; today: string; done?: boolean }) {
  if (!deadline) return <span className="subtle">-</span>;
  if (done) return <span className="subtle">selesai</span>;
  const d = diffDays(today, deadline.slice(0, 10));
  const cls = d < 0 ? 'late' : d <= 1 ? 'soon' : '';
  return <span className={`sisa ${cls}`}>{sisaLabel(d)}</span>;
}

export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <div className={`flash ${err ? 'err' : 'ok'}`} role="status">
      {err || ok}
    </div>
  );
}

export function HBars({
  items,
  tone,
  format = (n: number) => String(n),
  empty = 'Belum ada data',
}: {
  items: { label: string; value: number; tone?: 'muted' | 'danger' | '' }[];
  tone?: 'muted' | 'danger' | '';
  format?: (n: number) => string;
  empty?: string;
}) {
  const max = Math.max(0, ...items.map((i) => i.value));
  if (!items.length) return <div className="empty">{empty}</div>;
  return (
    <div className="bars">
      {items.map((i) => (
        <div className="bar-row" key={i.label} title={`${i.label}: ${format(i.value)}`}>
          <span className="name">{i.label}</span>
          <span className="bar-track">
            <span
              className={`bar-fill ${i.tone ?? tone ?? ''}`}
              style={{ width: max ? `${(i.value / max) * 100}%` : '0%', display: 'block' }}
            />
          </span>
          <span className="num">{format(i.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function Field({
  label,
  required,
  help,
  error,
  children,
  htmlFor,
}: {
  label: string;
  required?: boolean;
  help?: string;
  error?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className={`field${error ? ' invalid' : ''}`}>
      <label htmlFor={htmlFor}>
        {label}
        {required ? <span className="req"> *</span> : null}
      </label>
      {help ? <span className="help">{help}</span> : null}
      {children}
      {error ? <span className="error">{error}</span> : null}
    </div>
  );
}

export function LinkOrDash({ href }: { href: string }) {
  if (!href) return <span className="subtle">-</span>;
  if (!/^https?:\/\//i.test(href)) return <span>{href}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {href.length > 60 ? `${href.slice(0, 57)}…` : href}
    </a>
  );
}

export const rupiah = (v: string | number) => {
  const n = Number(v);
  return Number.isFinite(n) && String(v).trim() !== '' ? `Rp ${n.toLocaleString('id-ID')}` : String(v || '-');
};
