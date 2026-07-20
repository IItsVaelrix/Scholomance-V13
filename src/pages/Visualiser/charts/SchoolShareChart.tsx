import type { SchoolShare } from '../songScore';

interface SchoolShareChartProps {
  shares: SchoolShare[];
  activeSchools?: Record<string, number> | null;
}

export function SchoolShareChart({ shares, activeSchools }: SchoolShareChartProps) {
  if (!shares.length) {
    return <p className="bcv-chart-empty">Awaiting Truesight…</p>;
  }

  return (
    <div className="bcv-schoolshare">
      <div className="bcv-schoolshare__bar" role="img" aria-label="School association">
        {shares.map((s) => {
          const active = activeSchools && (activeSchools[s.school] ?? 0) > 0;
          return (
            <span
              key={s.school}
              className={`bcv-schoolshare__seg${active ? ' is-active' : ''}`}
              style={{
                flexGrow: s.count,
                background: s.color,
                ['--seg-color' as string]: s.color,
              }}
              title={`${s.school} ${s.pct}%`}
            />
          );
        })}
      </div>
      <ul className="bcv-schoolshare__legend">
        {shares.map((s) => {
          const active = activeSchools && (activeSchools[s.school] ?? 0) > 0;
          return (
            <li key={s.school} className={active ? 'is-active' : undefined}>
              <span className="bcv-schoolshare__swatch" style={{ background: s.color }} aria-hidden="true" />
              <span className="bcv-schoolshare__name">{s.school}</span>
              <span className="bcv-schoolshare__pct">{s.pct % 1 === 0 ? s.pct : s.pct.toFixed(1)}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
