/** Deterministic star field — fixed positions, no Math.random. */
const STARS = [
  { x: 8, y: 12, r: 1.2 },
  { x: 14, y: 28, r: 0.8 },
  { x: 22, y: 8, r: 1.0 },
  { x: 31, y: 19, r: 1.4 },
  { x: 38, y: 34, r: 0.9 },
  { x: 45, y: 11, r: 1.1 },
  { x: 52, y: 24, r: 0.7 },
  { x: 58, y: 6, r: 1.3 },
  { x: 64, y: 18, r: 0.8 },
  { x: 71, y: 31, r: 1.0 },
  { x: 78, y: 14, r: 1.2 },
  { x: 85, y: 27, r: 0.9 },
  { x: 92, y: 9, r: 1.1 },
  { x: 6, y: 44, r: 0.8 },
  { x: 18, y: 52, r: 1.0 },
  { x: 27, y: 41, r: 1.3 },
  { x: 36, y: 58, r: 0.7 },
  { x: 44, y: 47, r: 1.1 },
  { x: 53, y: 62, r: 0.9 },
  { x: 61, y: 49, r: 1.2 },
  { x: 69, y: 56, r: 0.8 },
  { x: 77, y: 43, r: 1.0 },
  { x: 86, y: 54, r: 1.4 },
  { x: 94, y: 38, r: 0.7 },
  { x: 11, y: 68, r: 1.1 },
  { x: 21, y: 74, r: 0.9 },
  { x: 29, y: 63, r: 1.0 },
  { x: 39, y: 78, r: 0.8 },
  { x: 48, y: 71, r: 1.2 },
  { x: 57, y: 84, r: 0.7 },
  { x: 66, y: 69, r: 1.1 },
  { x: 74, y: 76, r: 0.9 },
  { x: 83, y: 65, r: 1.3 },
  { x: 91, y: 72, r: 0.8 },
  { x: 16, y: 88, r: 1.0 },
  { x: 33, y: 91, r: 0.7 },
  { x: 50, y: 93, r: 1.1 },
  { x: 62, y: 89, r: 0.9 },
  { x: 79, y: 92, r: 1.2 },
  { x: 96, y: 86, r: 0.8 },
];

/** Edge pairs by star index — sparse constellation lines. */
const EDGES = [
  [0, 1],
  [1, 3],
  [3, 5],
  [5, 7],
  [7, 9],
  [9, 11],
  [14, 16],
  [16, 18],
  [18, 20],
  [20, 22],
  [24, 26],
  [26, 28],
];

export default function ConstellationBackdrop({ reducedMotion = false }) {
  const driftClass = reducedMotion ? '' : ' constellation-backdrop--drift';

  return (
    <svg
      id="constellation-backdrop"
      className={`constellation-backdrop${driftClass}`}
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
    >
      <g className="constellation-backdrop__edges">
        {EDGES.map(([a, b]) => {
          const from = STARS[a];
          const to = STARS[b];
          return (
            <line
              key={`${a}-${b}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              className="constellation-backdrop__edge"
            />
          );
        })}
      </g>
      <g className="constellation-backdrop__stars">
        {STARS.map((star, i) => (
          <circle
            key={i}
            cx={star.x}
            cy={star.y}
            r={star.r}
            className="constellation-backdrop__star"
          />
        ))}
      </g>
    </svg>
  );
}
