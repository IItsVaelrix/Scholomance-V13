import { test, expect } from '@playwright/test';

/**
 * Cross-mode layout fidelity (the "text morph" hypothesis).
 *
 * TrueSight may recolor words but must not change glyph advance — hit boxes are
 * measured from the plain textarea metrics (LING-0F08 / BUG-2026-06-20).
 *
 * Production strips advance-changing decoded styles via sanitizeTruesightStyle
 * (fontWeight / letterSpacing / …). This test mirrors that: class stack + color
 * only — never synthetic viseme weight/tracking that the overlay is forbidden
 * to apply.
 */

const WORDS = ['archive', 'lantern', 'Disrespectful', 'relationships', 'wanders'];
const TOLERANCE_PX = 0.5;
const CLASS_STACK =
  'truesight-word-inner pixel-brain-chip grimoire-word vb-effect--resonant vb-school--sonic vb-anchor';

test('TrueSight styling does not morph glyph advance width', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/__immune/truesight?mode=read&content=short&width=820', { waitUntil: 'load' });
  await page.waitForSelector('.word-background-layer', { state: 'attached', timeout: 15000 });
  await page.waitForSelector('body[data-immune-ready="true"]', { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);

  const results = await page.evaluate(({ words, classStack }) => {
    const host = document.querySelector('.word-background-layer')
      || document.querySelector('.ide-layout-wrapper')
      || document.body;

    // Match osmosis / glyph-advance harness: pin the plain textarea baseline so
    // inheritance quirks cannot masquerade as TrueSight morph.
    const measure = (word, mutate) => {
      const line = document.createElement('div');
      Object.assign(line.style, {
        position: 'absolute',
        visibility: 'hidden',
        left: '-9999px',
        top: '0',
        whiteSpace: 'pre',
        fontFamily: "var(--font-scroll, 'Crimson Pro', Georgia, 'Liberation Serif', serif)",
        fontSize: '24px',
        fontWeight: '400',
        fontStyle: 'normal',
        letterSpacing: 'normal',
        wordSpacing: 'normal',
        fontVariantLigatures: 'none',
        fontVariantNumeric: 'lining-nums',
        fontKerning: 'normal',
        textRendering: 'geometricPrecision',
      });
      const span = document.createElement('span');
      span.textContent = word;
      mutate(span);
      line.appendChild(span);
      host.appendChild(line);
      const w = span.getBoundingClientRect().width;
      line.remove();
      return +w.toFixed(3);
    };

    return words.map((word) => {
      const plain = measure(word, () => {});
      const classesOnly = measure(word, (s) => {
        s.className = classStack;
      });
      const full = measure(word, (s) => {
        // Production path after sanitizeTruesightStyle: color + class stack only.
        s.className = classStack;
        s.style.setProperty('--w', '#1980e6');
        s.style.color = '#1980e6';
      });
      const weightForbidden = measure(word, (s) => {
        s.className = classStack;
        s.style.fontWeight = '650';
      });
      return {
        word,
        plain,
        classesOnly,
        full,
        weightForbidden,
        deltaClasses: +(classesOnly - plain).toFixed(3),
        deltaFull: +(full - plain).toFixed(3),
        deltaWeightForbidden: +(weightForbidden - plain).toFixed(3),
      };
    });
  }, { words: WORDS, classStack: CLASS_STACK });

  console.log('\nCROSS-MODE ADVANCE DELTA');
  for (const r of results) {
    console.log(
      `  ${r.word.padEnd(15)} plain=${r.plain}  styled=${r.full}  Δ=${r.deltaFull}px`
      + `  (classes=${r.deltaClasses}, weightForbidden=${r.deltaWeightForbidden})`,
    );
  }
  const worst = results.reduce((m, r) => Math.max(m, Math.abs(r.deltaFull)), 0);
  console.log(`  worst Δ = ${worst.toFixed(3)}px`);

  for (const r of results) {
    expect(
      Math.abs(r.deltaClasses),
      `"${r.word}" class stack morphs advance by ${r.deltaClasses}px`,
    ).toBeLessThanOrEqual(TOLERANCE_PX);
    expect(
      Math.abs(r.deltaFull),
      `"${r.word}" advance morphs between plain and TrueSight by ${r.deltaFull}px`,
    ).toBeLessThanOrEqual(TOLERANCE_PX);
    // Guard: if someone reintroduces weight into the paint path, this stays red.
    expect(
      Math.abs(r.deltaWeightForbidden),
      `"${r.word}" font-weight=650 should morph (control)`,
    ).toBeGreaterThan(TOLERANCE_PX);
  }
});
