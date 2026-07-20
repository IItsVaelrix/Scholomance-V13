import type { LineScore } from '../songScore';

interface PhonemicDensityChartProps {
  lines: LineScore[];
  activeLine: number;
  reducedMotion?: boolean;
}

export function PhonemicDensityChart({
  lines,
  activeLine,
  reducedMotion = false,
}: PhonemicDensityChartProps) {
  if (!lines.length) {
    return <p className="bcv-chart-empty">No lines</p>;
  }

  const max = Math.max(1, ...lines.map((l) => l.syllables));
  const h = Math.max(48, Math.min(140, lines.length * 7));
  const pad = 4;
  const barGap = 1.5;
  const innerH = h - pad * 2;
  const barH = Math.max(2, (innerH - barGap * (lines.length - 1)) / lines.length);

  return (
    <svg
      className="bcv-density"
      viewBox={`0 0 120 ${h}`}
      role="img"
      aria-label="Phonemic density by line"
    >
      {lines.map((line, i) => {
        const y = pad + i * (barH + barGap);
        const w = (line.syllables / max) * 100;
        const active = i === activeLine;
        return (
          <g key={line.index} className={active ? 'is-active' : undefined}>
            <rect
              className="bcv-density__track"
              x={10}
              y={y}
              width={100}
              height={barH}
              rx={1}
            />
            <rect
              className={`bcv-density__bar${active ? ' bcv-density__bar--playhead' : ''}${reducedMotion ? '' : ''}`}
              x={10}
              y={y}
              width={Math.max(1.5, w)}
              height={barH}
              rx={1}
            />
            {active && (
              <rect
                className="bcv-density__cursor"
                x={8}
                y={y - 0.5}
                width={2}
                height={barH + 1}
                rx={0.5}
              />
            )}
            {(i === 0 || i === lines.length - 1 || i % Math.max(1, Math.floor(lines.length / 4)) === 0) && (
              <text className="bcv-density__label" x={0} y={y + barH * 0.75} fontSize={5}>
                {String(i + 1).padStart(2, '0')}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
