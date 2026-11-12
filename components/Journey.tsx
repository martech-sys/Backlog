import { JOURNEY, type JourneyPos } from '@/lib/journey';

/**
 * Indikator progress journey: titik per tahap utama, tahap aktif ditandai, tahap yang dilewati terisi.
 * `size="lg"` dipakai di detail task (dengan label tiap tahap), default ringkas untuk tabel.
 */
export function Journey({ pos, size = 'sm', flags = size === 'lg' }: { pos: JourneyPos; size?: 'sm' | 'lg'; flags?: boolean }) {
  return (
    <div className={`journey ${size}`} aria-label={`Tahap ${pos.index + 1} dari ${JOURNEY.length}: ${pos.stage}`}>
      <ol>
        {JOURNEY.map((s, i) => (
          <li key={s} className={i < pos.index ? 'done' : i === pos.index ? 'current' : ''} title={s}>
            <span className="dot" />
            {size === 'lg' ? <span className="lbl">{s}</span> : null}
          </li>
        ))}
      </ol>
      {flags && pos.flags.length ? (
        <div className="journey-flags">
          {pos.flags.map((f) => (
            <span key={f} className={`badge ${f === 'Overdue' ? 'red' : 'amber'}`}>
              {f}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
