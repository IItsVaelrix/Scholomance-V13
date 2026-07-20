import type { LineScore } from '../songScore';

interface DeliveryPressureChartProps {
  lines: LineScore[];
  activeLine: number;
}

export function DeliveryPressureChart({ lines, activeLine }: DeliveryPressureChartProps) {
  if (!lines.length) {
    return <p className="bcv-chart-empty">No lines</p>;
  }

  const max = Math.max(0.01, ...lines.map((l) => l.pressure));
  const W = 120;
  const H = 72;
  const padX = 6;
  const padY = 8;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  const points = lines.map((line, i) => {
    const x = padX + (lines.length === 1 ? innerW / 2 : (i / (lines.length - 1)) * innerW);
    const y = padY + innerH - (line.pressure / max) * innerH;
    return { x, y, active: i === activeLine, pressure: line.pressure };
  });

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ');

  const area = `${path} L${points[points.length - 1].x.toFixed(2)},${(padY + innerH).toFixed(2)} L${points[0].x.toFixed(2)},${(padY + innerH).toFixed(2)} Z`;

  const active = points.find((p) => p.active);

  return (
    <svg
      className="bcv-pressure"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Delivery pressure syllables per beat"
    >
      <defs>
        <linearGradient id="bcv-pressure-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--grim-color, var(--bcv-world))" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--grim-color, var(--bcv-world))" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path className="bcv-pressure__area" d={area} fill="url(#bcv-pressure-fill)" />
      <path className="bcv-pressure__line" d={path} fill="none" />
      {active && (
        <>
          <line
            className="bcv-pressure__cursor"
            x1={active.x}
            x2={active.x}
            y1={padY}
            y2={padY + innerH}
          />
          <circle className="bcv-pressure__dot" cx={active.x} cy={active.y} r={2.4} />
        </>
      )}
      <text className="bcv-pressure__meta" x={padX} y={H - 1} fontSize={5}>
        syl / beat
      </text>
    </svg>
  );
}
