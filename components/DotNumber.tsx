/**
 * Angka bergaya dot-matrix (5×7 titik) untuk kartu ringkasan dashboard.
 * Titik menyala putih penuh, titik mati tetap tampak samar agar terlihat seperti panel LED.
 */
const GLYPHS: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '%': ['11000', '11001', '00010', '00100', '01000', '10011', '00011'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '–': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '.': ['0', '0', '0', '0', '0', '0', '1'],
  ',': ['0', '0', '0', '0', '0', '1', '1'],
  ' ': ['00', '00', '00', '00', '00', '00', '00'],
};

const STEP = 10;
const R = 3.7;

export function DotNumber({ value, className = '' }: { value: string | number; className?: string }) {
  const text = String(value);
  const chars = [...text].map((c) => GLYPHS[c] || GLYPHS[' ']);
  let x = 0;
  const dots: { cx: number; cy: number; on: boolean }[] = [];
  chars.forEach((g, i) => {
    const w = g[0].length;
    g.forEach((row, ry) =>
      [...row].forEach((bit, rx) => dots.push({ cx: x + rx * STEP + STEP / 2, cy: ry * STEP + STEP / 2, on: bit === '1' })),
    );
    x += w * STEP + (i < chars.length - 1 ? STEP : 0);
  });
  const width = Math.max(x, STEP);
  return (
    <svg className={`dotnum ${className}`} viewBox={`0 0 ${width} ${7 * STEP}`} role="img" aria-label={text}>
      {dots.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={R} className={d.on ? 'on' : 'off'} />
      ))}
    </svg>
  );
}
