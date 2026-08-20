/**
 * THE METRIC HONESTY RULES.
 *
 * Three times in one week a measurement in this repository was reported as
 * something it was not, and every one of the three ran in the reporting layer
 * rather than the measuring layer. The numbers were right. The labels were not.
 *
 *   1. `composePacked` containment counted with `.some()` was printed as
 *      "head accuracy" in the multi-aperture doorway table. Containment asks
 *      whether the gold head appears in ANY reading; head accuracy asks whether
 *      it is the FIRST one. The script that got it right — the shuffled-light
 *      falsifier — sits forty lines below the script that got it wrong.
 *
 *   2. The three-control ladder printed `100 - containment/159` under a column
 *      headed "Gold Loss". That is a miss rate, not a loss: real descending
 *      light scores 79.9% by the same formula and would report itself as having
 *      lost 20.1% of the answers it in fact retained. Control 3's true
 *      degradation was 6.7%; the table said 25.5%.
 *
 *   3. That same ladder printed `=> PROOF` after ten Monte Carlo seeds without
 *      printing a standard deviation, a confidence interval, or a p-value. Ten
 *      seeds were run. Only the means were reported.
 *
 * ─── WHY A LINTER AND NOT A CONVENTION ──────────────────────────────────────
 *
 * All three errors ran in the same direction: they made a result look stronger
 * than it was. None of them survived contact with an instrument — the ladder
 * itself retired defect 2's headline. What has no instrument is the moment a
 * number is given a name, and that is what these rules watch.
 *
 * ─── WHAT THEY CANNOT DO ────────────────────────────────────────────────────
 *
 * These are pattern rules over the evidence scripts. They cannot see a label
 * that is only wrong in a white paper's markdown, and they will have false
 * positives, which is why the override in `.eslintrc.json` names its files
 * explicitly rather than globbing all 214 scripts.
 */

import { RuleTester } from 'eslint';

import containmentNotAccuracy from '../../eslint-rules/eslint-plugin-metric-honesty/rules/containment-not-accuracy.js';
import noConstantBaseline from '../../eslint-rules/eslint-plugin-metric-honesty/rules/no-constant-baseline.js';
import verdictNeedsDispersion from '../../eslint-rules/eslint-plugin-metric-honesty/rules/verdict-needs-dispersion.js';

const ruleTester = new RuleTester({
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

ruleTester.run('containment-not-accuracy', containmentNotAccuracy, {
  valid: [
    // The correct idiom, lifted from Battery 4 of the reproducer: an existence
    // check feeds a counter named for containment.
    'if (realAns.some((a) => a.verb === gold.verb)) realGoldContainment += 1;',
    // A genuine top-1 check may call itself a head match.
    'if (realAns[0]?.verb === gold.verb) realGoldHeads += 1;',
    'if (realAns.at(0)?.verb === gold.verb) headAccuracy += 1;',
    // `.some()` feeding something that claims nothing about heads is fine.
    'if (tokens.some((t) => t.dark)) darkSentences += 1;',
    // Assignment form of the correct idiom.
    'const goldContainment = answers.some((a) => a.verb === gold.verb);',
  ],
  invalid: [
    {
      // Battery 1 of scripts/reproduce-whitepaper-results.mjs, verbatim.
      code: 'if (ans.some((a) => a.verb === gold.verb)) clausalHeads += 1;',
      errors: [{ messageId: 'existenceCountedAsHead', data: { name: 'clausalHeads' } }],
    },
    {
      code: 'if (ans.some((a) => a.verb === gold.verb)) doorwayHeads += 1;',
      errors: [{ messageId: 'existenceCountedAsHead', data: { name: 'doorwayHeads' } }],
    },
    {
      // The `++` form counts the same way.
      code: 'if (ans.some((a) => a.verb === gold.verb)) headAccuracy++;',
      errors: [{ messageId: 'existenceCountedAsHead', data: { name: 'headAccuracy' } }],
    },
    {
      // Assignment rather than a counter.
      code: 'const meanHeadAccuracy = answers.some((a) => a.verb === gold.verb);',
      errors: [{ messageId: 'existenceCountedAsHead', data: { name: 'meanHeadAccuracy' } }],
    },
    {
      // scripts/harmonized-cooperative-assay.mjs: the counter lives on an object,
      // which is how three scripts carried this defect past the first version of
      // this rule.
      code: 'if (ans.some((a) => a.verb === gold.verb)) statsBlind.goldHead += 1;',
      errors: [{ messageId: 'existenceCountedAsHead', data: { name: 'statsBlind.goldHead' } }],
    },
    {
      code: 'if (ans.some((a) => a.verb === gold.verb)) statsA.headAccuracy++;',
      errors: [{ messageId: 'existenceCountedAsHead', data: { name: 'statsA.headAccuracy' } }],
    },
  ],
});

ruleTester.run('no-constant-baseline', noConstantBaseline, {
  valid: [
    // Both sides measured: this is what a loss actually is.
    'console.log(`${(realContainment - armContainment).toFixed(1)} gold answers lost`);',
    'console.log(`${(baseline - arm).toFixed(1)}% degradation`);',
    // A literal complement that claims nothing about loss is fine — this is a
    // share of the whole, not a delta against a baseline.
    'console.log(`${(100 - sharePct).toFixed(1)}% remaining`);',
    // A literal subtraction that never reaches a report.
    'const headroom = 100 - utilisationPct;',
  ],
  invalid: [
    {
      // scripts/descending-light-three-control-ladder.mjs, the "Gold Loss" column.
      code: 'console.log(`-${(100 - parseFloat(ctrl1.containmentPct)).toFixed(1)}% gold loss`);',
      errors: [{ messageId: 'constantBaseline', data: { literal: '100' } }],
    },
    {
      // A hardcoded ground-truth baseline is the same defect: the number is
      // frozen into the reporting line instead of read from the run.
      code: 'console.log(`${(127 - parseFloat(ctrl3.meanContainment)).toFixed(1)} answers lost`);',
      errors: [{ messageId: 'constantBaseline', data: { literal: '127' } }],
    },
    {
      code: 'const row = `Gold Loss: ${100 - x}%`;',
      errors: [{ messageId: 'constantBaseline', data: { literal: '100' } }],
    },
    {
      code: 'console.log(`accuracy drop: ${1 - ratio}`);',
      errors: [{ messageId: 'constantBaseline', data: { literal: '1' } }],
    },
  ],
});

ruleTester.run('verdict-needs-dispersion', verdictNeedsDispersion, {
  valid: [
    // Ten seeds and the spread is reported alongside the verdict.
    'for (const seed of seeds) { run(seed); }\nconsole.log(`sd=${sd}`);\nconsole.log("=> PROOF: light is causal");',
    'const trials = 10;\nconsole.log(`95% CI ${confidenceInterval}`);\nconsole.log("[CONFIRMED] holds");',
    // A verdict with nothing repeated is a single deterministic run; there is
    // no dispersion to report. Battery 4 of the reproducer is this case.
    'console.log("[PASS] real light carries reachability");',
    // Sampling with no verdict claimed.
    'for (const seed of seeds) { run(seed); }\nconsole.log(`mean ${mean}`);',
    // A single deterministic shuffle takes a `seed` PARAMETER and samples ONCE.
    // Battery 4 of the reproducer and the crystallization falsifier are both this
    // shape; demanding dispersion from an n of one is a check that cannot pass.
    'function deterministicShuffle(array, seed = 0x5c4010) { return array; }\nconsole.log("[PASS] real light carries reachability");',
  ],
  invalid: [
    {
      // scripts/descending-light-three-control-ladder.mjs: ten seeds, means only.
      code: 'for (const seed of seeds) { run(seed); }\nconsole.log("  => PROOF: Causal variable is the exact lawful reachability DAG.");',
      errors: [{ messageId: 'verdictWithoutDispersion', data: { verdict: 'PROOF' } }],
    },
    {
      code: 'const trials = 10;\nfor (let i = 0; i < trials; i++) { run(i); }\nconsole.log(`[CONFIRMED] the effect holds at ${meanDelta}`);',
      errors: [{ messageId: 'verdictWithoutDispersion', data: { verdict: 'CONFIRMED' } }],
    },
    {
      code: 'const samples = draw();\nconsole.log("[SIGNIFICANT] arm beats control");',
      errors: [{ messageId: 'verdictWithoutDispersion', data: { verdict: 'SIGNIFICANT' } }],
    },
  ],
});
