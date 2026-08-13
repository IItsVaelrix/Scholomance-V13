/**
 * Always-on Compose sky for the ConstellationOS chamber.
 *
 * The Compose scene (`createConstellationSkyScene`) is the contract gate: it is
 * validated once, its parts (nebula-field / constellation-field / star-dust) tag
 * the rendered groups via `data-part`, and if validation ever fails the shell
 * degrades to the plain deterministic star field (PDR §7.8). The SVG itself is
 * painted here — the same division of labour as ComposeGalaxyBackdrop, where the
 * packet gates and StormCanvas paints.
 *
 * Every animated value is derived from the page bytecode (skyChart.js), never
 * Math.random — same page, same sky (VAELRIX Law 6 / PDR §7.6-§7.7).
 */

import { useMemo } from 'react';
import { createConstellationSkyScene } from '../../core/compose/migrated/ConstellationSky.ts';
import { validateComposeScene } from '../../core/compose/packets.ts';
import ConstellationBackdrop from './ConstellationBackdrop.jsx';
import {
  CONSTELLATIONS,
  DUST,
  SPARK_PATH,
  skySeed,
  twinkleFor,
  lodestarIndex,
} from './skyChart.js';

export default function ComposeConstellationSky({ reducedMotion = false, bytecode = null }) {
  const sceneValid = useMemo(
    () => validateComposeScene(createConstellationSkyScene()).ok,
    [],
  );

  const seed = useMemo(() => skySeed(bytecode), [bytecode]);
  const lodestar = useMemo(() => lodestarIndex(seed), [seed]);

  // Fallback keeps the same #constellation-backdrop id + aria-hidden contract.
  if (!sceneValid) {
    return <ConstellationBackdrop reducedMotion={reducedMotion} />;
  }

  const driftClass = reducedMotion ? '' : ' constellation-sky--animate';

  let anchorCursor = -1;

  return (
    <svg
      id="constellation-backdrop"
      className={`constellation-sky${driftClass}`}
      data-compose-part="constellation-sky"
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id="cos-neb-amethyst" cx="30%" cy="34%" r="55%">
          <stop offset="0%" stopColor="rgba(120, 96, 220, 0.42)" />
          <stop offset="55%" stopColor="rgba(70, 52, 150, 0.14)" />
          <stop offset="100%" stopColor="rgba(70, 52, 150, 0)" />
        </radialGradient>
        <radialGradient id="cos-neb-arc" cx="72%" cy="62%" r="52%">
          <stop offset="0%" stopColor="rgba(46, 120, 170, 0.34)" />
          <stop offset="60%" stopColor="rgba(30, 78, 120, 0.12)" />
          <stop offset="100%" stopColor="rgba(30, 78, 120, 0)" />
        </radialGradient>
        <radialGradient id="cos-neb-deep" cx="52%" cy="88%" r="60%">
          <stop offset="0%" stopColor="rgba(40, 26, 74, 0.5)" />
          <stop offset="100%" stopColor="rgba(6, 6, 16, 0)" />
        </radialGradient>
        <filter id="cos-dust" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0.72  0 0 0 0 0.80  0 0 0 0 1  0 0 0 0.06 0"
          />
        </filter>
        <radialGradient id="cos-star-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(232, 240, 255, 1)" />
          <stop offset="45%" stopColor="rgba(191, 214, 255, 0.9)" />
          <stop offset="100%" stopColor="rgba(139, 124, 255, 0)" />
        </radialGradient>
        <radialGradient id="cos-star-gold" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255, 244, 214, 1)" />
          <stop offset="45%" stopColor="rgba(232, 201, 106, 0.95)" />
          <stop offset="100%" stopColor="rgba(232, 201, 106, 0)" />
        </radialGradient>
      </defs>

      {/* Nebula field — layered galaxy dust */}
      <g className="constellation-sky__nebula" data-part="nebula-field">
        <rect x="0" y="0" width="100" height="100" fill="url(#cos-neb-deep)" />
        <rect x="0" y="0" width="100" height="100" fill="url(#cos-neb-amethyst)" />
        <rect x="0" y="0" width="100" height="100" fill="url(#cos-neb-arc)" />
        <rect x="0" y="0" width="100" height="100" filter="url(#cos-dust)" opacity="0.55" />
      </g>

      {/* Star dust — quiet depth */}
      <g className="constellation-sky__dust" data-part="star-dust">
        {DUST.map((d, i) => (
          <circle key={`d${i}`} cx={d.x} cy={d.y} r={d.r} className="constellation-sky__dust-star" />
        ))}
      </g>

      {/* Named constellations — edges under stars */}
      <g className="constellation-sky__figures" data-part="constellation-field">
        {CONSTELLATIONS.map((c) => {
          const byId = Object.fromEntries(c.stars.map((s) => [s.id, s]));
          return (
            <g key={c.name} className="constellation-sky__figure">
              <g className="constellation-sky__edges">
                {c.edges.map(([a, b]) => {
                  const from = byId[a];
                  const to = byId[b];
                  return (
                    <line
                      key={`${a}-${b}`}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      className="constellation-sky__edge"
                    />
                  );
                })}
              </g>
              {c.stars.map((s) => {
                anchorCursor += 1;
                const index = anchorCursor;
                const isLode = index === lodestar;
                const { delaySec, durationSec } = twinkleFor(seed, index);
                const style = reducedMotion
                  ? undefined
                  : { animationDelay: `${delaySec}s`, animationDuration: `${durationSec}s` };
                const cls =
                  'constellation-sky__star' +
                  (s.glyph === 'spark' ? ' constellation-sky__star--spark' : ' constellation-sky__star--dot') +
                  (isLode ? ' constellation-sky__star--lode' : '');
                const fill = isLode ? 'url(#cos-star-gold)' : 'url(#cos-star-core)';

                if (s.glyph === 'spark') {
                  const scale = s.mag * 1.9;
                  return (
                    <path
                      key={s.id}
                      d={SPARK_PATH}
                      transform={`translate(${s.x} ${s.y}) scale(${scale})`}
                      fill={fill}
                      className={cls}
                      style={style}
                    />
                  );
                }
                return (
                  <circle
                    key={s.id}
                    cx={s.x}
                    cy={s.y}
                    r={s.mag * 0.85}
                    fill={fill}
                    className={cls}
                    style={style}
                  />
                );
              })}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
