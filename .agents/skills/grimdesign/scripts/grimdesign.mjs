#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import path from 'node:path';

const SCHOOL_FALLBACK = Object.freeze({
  SONIC: { h: 267, s: 52, l: 52, transitionMs: 210, fontWeight: 700 },
  PSYCHIC: { h: 196, s: 62, l: 51, transitionMs: 280, fontWeight: 400 },
  ALCHEMY: { h: 306, s: 60, l: 49, transitionMs: 300, fontWeight: 400 },
  WILL: { h: 32, s: 44, l: 54, transitionMs: 360, fontWeight: 400 },
  VOID: { h: 238, s: 18, l: 37, transitionMs: 520, fontWeight: 300 },
  NECROMANCY: { h: 142, s: 28, l: 38, transitionMs: 400, fontWeight: 400 },
  ABJURATION: { h: 47, s: 45, l: 54, transitionMs: 320, fontWeight: 400 },
  DIVINATION: { h: 205, s: 36, l: 50, transitionMs: 350, fontWeight: 400 },
});

const EFFECT = Object.freeze({
  INERT: { borderAlpha: 0.15, glowRadius: 0, animationClass: null, animationDurationMs: 0, atmosphereLevel: 'none', scanlines: false },
  RESONANT: { borderAlpha: 0.35, glowRadius: 12, animationClass: 'grim-pulse', animationDurationMs: 2400, atmosphereLevel: 'faint', scanlines: false },
  HARMONIC: { borderAlpha: 0.55, glowRadius: 20, animationClass: 'grim-breathe', animationDurationMs: 1600, atmosphereLevel: 'present', scanlines: false },
  TRANSCENDENT: { borderAlpha: 0.85, glowRadius: 32, animationClass: 'grim-shimmer', animationDurationMs: 800, atmosphereLevel: 'full', scanlines: true },
});

function intentFromArgs(argv) {
  return argv.join(' ').trim();
}

function componentName(intent) {
  const words = String(intent || 'grim design component')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  const name = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('');
  return `${name || 'GrimDesign'}Surface`;
}

function classifyEffect(intent) {
  const lower = intent.toLowerCase();
  if (/\b(transcendent|beacon|cataclysm|ultimate|surge|burst|combat|reveal)\b/.test(lower)) return 'TRANSCENDENT';
  if (/\b(harmonic|ritual|resonance|glow|active|cooldown|spell|agent)\b/.test(lower)) return 'HARMONIC';
  if (/\b(pulse|status|indicator|signal|panel|badge|meter)\b/.test(lower)) return 'RESONANT';
  return 'INERT';
}

function heuristic(intent, reason) {
  const upper = intent.toUpperCase();
  const dominantSchool = Object.keys(SCHOOL_FALLBACK).find((school) => upper.includes(school)) || 'VOID';
  const school = SCHOOL_FALLBACK[dominantSchool];
  const effectClass = classifyEffect(intent);
  const effect = EFFECT[effectClass];
  const wordCount = intent.split(/\s+/).filter(Boolean).length;
  const componentComplexity = Math.max(1, Math.min(4, Math.ceil(wordCount / 3)));
  const rarity = effectClass === 'TRANSCENDENT' ? 'INEXPLICABLE' : effectClass === 'HARMONIC' ? 'RARE' : 'COMMON';
  const fontSizeRem = rarity === 'INEXPLICABLE' ? 0.95 : rarity === 'RARE' ? 0.85 : 0.78;
  const glowColor = `hsla(${school.h}, ${school.s}%, ${Math.min(75, school.l + 20)}%, 0.5)`;

  const signal = {
    dominantSchool,
    effectClass,
    glowIntensity: effect.glowRadius === 0 ? 0 : effect.glowRadius / 32,
    blendedHsl: { h: school.h, s: school.s, l: school.l },
    syllableDepth: componentComplexity,
    rarity,
    schoolWeights: { [dominantSchool]: 1 },
    vowelFamilyDistribution: {},
    provenance: [
      `[HEURISTIC - server not running] ${reason}`,
      `dominantSchool: ${dominantSchool} (keyword fallback)`,
      `effectClass: ${effectClass} (intent keyword estimate)`,
      `blendedHsl: hsl(${school.h}, ${school.s}%, ${school.l}%) (school fallback table)`,
    ],
  };

  const decisions = {
    color: `hsl(${school.h}, ${school.s}%, ${school.l}%)`,
    colorMuted: `hsl(${school.h}, ${school.s}%, ${Math.min(75, school.l + 15)}%)`,
    glowColor,
    borderAlpha: effect.borderAlpha,
    glowRadius: effect.glowRadius,
    paddingScale: rarity === 'COMMON' ? 'tight' : rarity === 'RARE' ? 'standard' : 'generous',
    componentComplexity,
    transitionMs: school.transitionMs,
    animationClass: effect.animationClass,
    animationDurationMs: effect.animationDurationMs,
    atmosphereLevel: effect.atmosphereLevel,
    scanlines: effect.scanlines,
    fontSizeRem,
    fontWeight: school.fontWeight,
    ornament: rarity !== 'COMMON',
    cssVars: {
      '--grim-color': `hsl(${school.h}, ${school.s}%, ${school.l}%)`,
      '--grim-color-muted': `hsl(${school.h}, ${school.s}%, ${Math.min(75, school.l + 15)}%)`,
      '--grim-glow': effect.glowRadius > 0 ? `0 0 ${effect.glowRadius}px ${glowColor}` : 'none',
      '--grim-border': `1px solid hsla(${school.h}, ${school.s}%, ${Math.min(75, school.l + 15)}%, ${effect.borderAlpha})`,
      '--grim-transition': `${school.transitionMs}ms ease-in-out`,
      '--grim-font-size': `${fontSizeRem}rem`,
      '--grim-font-weight': String(school.fontWeight),
    },
    worldLawReason: `${dominantSchool}-school heuristic character (effectClass ${effectClass}) at hsl(${school.h}, ${school.s}%, ${school.l}%)`,
    provenance: signal.provenance,
  };

  return { source: 'heuristic', signal, decisions };
}

async function fromServer(intent) {
  const response = await fetch('http://localhost:3000/api/grimdesign/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent }),
  });
  if (!response.ok) throw new Error(`server returned HTTP ${response.status}`);
  return { source: 'server', ...(await response.json()) };
}

async function fromLocalCodex(intent) {
  const cwd = process.cwd();
  const analyzerUrl = pathToFileURL(path.join(cwd, 'codex/core/grimdesign/intentAnalyzer.js')).href;
  const decisionsUrl = pathToFileURL(path.join(cwd, 'codex/core/grimdesign/decisionEngine.js')).href;
  const [{ analyzeDesignIntent }, { resolveDesignDecisions }] = await Promise.all([
    import(analyzerUrl),
    import(decisionsUrl),
  ]);
  const signal = await analyzeDesignIntent(intent);
  const decisions = resolveDesignDecisions(signal);
  return { source: 'local-codex', signal, decisions };
}

function complexityLabel(level) {
  return ({
    1: 'single surface',
    2: 'header + body',
    3: 'header + body + footer/meta row',
    4: 'full card with multiple sections',
  })[level] || 'single surface';
}

function renderMarkdown(intent, result) {
  const { signal, decisions, source } = result;
  const hsl = signal.blendedHsl || { h: 238, s: 18, l: 37 };
  const glow = decisions.glowRadius > 0 ? `0 0 ${decisions.glowRadius}px ${decisions.glowColor}` : 'none';
  const border = `1px solid hsla(${hsl.h}, ${hsl.s}%, ${Math.min(75, hsl.l + 15)}%, ${decisions.borderAlpha})`;
  const animation = decisions.animationClass
    ? `${decisions.animationClass} ${decisions.animationDurationMs}ms ease-in-out`
    : 'none';
  const atmosphere = `${decisions.atmosphereLevel}${decisions.scanlines ? ' + scanlines' : ''}`;
  const className = componentName(intent).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  const animationClass = decisions.animationClass ? ` ${decisions.animationClass}` : '';
  const keyframes = decisions.animationClass === 'grim-pulse'
    ? `\n@keyframes grim-pulse {\n  0%, 100% { opacity: 0.82; box-shadow: ${glow}; }\n  50% { opacity: 1; box-shadow: 0 0 ${Math.max(decisions.glowRadius + 4, 4)}px ${decisions.glowColor}; }\n}\n`
    : decisions.animationClass === 'grim-breathe'
      ? `\n@keyframes grim-breathe {\n  0%, 100% { transform: scale(1); box-shadow: ${glow}; }\n  50% { transform: scale(1.015); box-shadow: 0 0 ${Math.max(decisions.glowRadius + 8, 8)}px ${decisions.glowColor}; }\n}\n`
      : decisions.animationClass === 'grim-shimmer'
        ? `\n@keyframes grim-shimmer {\n  0%, 100% { filter: hue-rotate(0deg) brightness(1); }\n  50% { filter: hue-rotate(20deg) brightness(1.15); }\n}\n`
        : '';

  return `## ${componentName(intent)} - GrimDesign Output

CLASSIFICATION: new component
WHY: ${decisions.worldLawReason}
WORLD-LAW CONNECTION: ${signal.dominantSchool} / ${signal.effectClass} via hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%) (${source})

SIGNAL PROVENANCE:
${(signal.provenance || decisions.provenance || []).map((line) => `  ${line}`).join('\n')}

DESIGN DECISIONS:
  color:        ${decisions.color}
  glow:         ${glow}
  border:       ${border}
  animation:    ${animation}
  atmosphere:   ${atmosphere}
  complexity:   ${decisions.componentComplexity} (${complexityLabel(decisions.componentComplexity)})
  transition:   ${decisions.transitionMs}ms

CODE:
\`\`\`jsx
export function ${componentName(intent)}({ title, children }) {
  return (
    <section className="${className}${animationClass}" aria-label={title}>
      <header className="${className}__header">{title}</header>
      <div className="${className}__body">{children}</div>
    </section>
  );
}
\`\`\`

CSS DELTA:
\`\`\`css
.${className} {
  --grim-color: ${decisions.cssVars?.['--grim-color'] || decisions.color};
  --grim-color-muted: ${decisions.cssVars?.['--grim-color-muted'] || decisions.colorMuted};
  --grim-glow: ${glow};
  --grim-border: ${border};
  --grim-transition: ${decisions.cssVars?.['--grim-transition'] || `${decisions.transitionMs}ms ease-in-out`};
  --grim-font-size: ${decisions.cssVars?.['--grim-font-size'] || `${decisions.fontSizeRem}rem`};
  --grim-font-weight: ${decisions.cssVars?.['--grim-font-weight'] || decisions.fontWeight};
  border: var(--grim-border);
  color: var(--grim-color-muted);
  box-shadow: var(--grim-glow);
  font-size: var(--grim-font-size);
  font-weight: var(--grim-font-weight);
  transition: border-color var(--grim-transition), box-shadow var(--grim-transition);
}

@media (prefers-reduced-motion: no-preference) {
  .${className}.${decisions.animationClass || 'grim-static'} {
    animation: ${animation};
  }
}
${keyframes}
\`\`\`

HANDOFF TO BLACKBOX:
- Add or update visual coverage for the component surface that consumes this spec.

QA CHECKLIST:
- [ ] No logic imported from codex/ or src/lib/
- [ ] State via hooks/context only
- [ ] ARIA labels present
- [ ] Reduced motion respected
- [ ] School CSS variables consumed, not hardcoded
- [ ] No inline styles for state
- [ ] dangerouslySetInnerHTML sanitized if used
`;
}

async function main() {
  const intent = intentFromArgs(process.argv.slice(2));
  if (!intent) {
    console.error('Usage: node .claude/skills/grimdesign/scripts/grimdesign.mjs "<design intent>" [--json]');
    process.exitCode = 2;
    return;
  }

  const json = process.argv.includes('--json');
  const cleanIntent = intent.replace(/\s--json\b/g, '').trim();
  let result;
  try {
    result = await fromServer(cleanIntent);
  } catch (serverError) {
    try {
      result = await fromLocalCodex(cleanIntent);
    } catch (localError) {
      result = heuristic(cleanIntent, `${serverError.message}; local CODEx fallback failed: ${localError.message}`);
    }
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(renderMarkdown(cleanIntent, result));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
