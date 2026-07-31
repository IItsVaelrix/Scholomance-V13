/**
 * CONTROL GATE — separating the bar from the detector
 * ========================================================================
 * PB-SIM-CONTROLGATE-v1
 *
 * Concept Chemistry runs gate on "the winner must beat every control". That
 * rule is right, but it silently conflates two instruments with different
 * jobs, and the conflation was measured across five runs on 2026-07-30:
 * control/law-violation was the top-scoring control in three consecutive
 * questions, and therefore set the bar in all three.
 *
 * The two jobs:
 *
 *   BAR CONTROLS (nonsense, false friends) are authored to be ranked BELOW
 *     real candidates. A candidate that cannot beat a false friend has not
 *     distinguished itself from a seductive wrong idea. These set the floor.
 *
 *   LAW CONTROLS are authored to be REJECTED BY THE LAW GATE, not merely
 *     out-ranked. Their job is to detect whether lawGate still works. Using
 *     one as the floor is a category error: a law violation stated in fluent
 *     domain vocabulary is highly bondable and well grounded, so it scores
 *     high precisely when the law gate has failed to catch it — raising the
 *     bar at the exact moment the instrument is broken.
 *
 * So: bar = max(bar controls). Law controls are reported as a DIAGNOSTIC.
 * A law control that scores above the bar without lawNote reporting
 * LAW_VIOLATION is a finding about lawGate, not a higher standard for the
 * candidates.
 *
 * This makes the gate LESS conservative, which is a real risk — it lowers the
 * floor. The mitigation is that false-friend controls, which are the ones
 * actually designed to be hard to beat, still set it.
 */

export const SCHEMA = 'PB-SIM-CONTROLGATE-v1';

/** A control whose id matches this is a detector, not a floor. */
const LAW_CONTROL = /law[-_]?violation/i;

/**
 * Split controls, compute the bar, and diagnose the law gate.
 *
 * @param {Array<object>} results - scored reactions, each { id, <groupKey>, feasibility, lawNote }
 * @param {object} [options]
 * @param {string} [options.groupKey='group'] - field naming the reaction's group.
 *   concept-chem-determinism.mjs keys this as `hazard`.
 * @returns {{
 *   bar: number, barId: string|null,
 *   barControls: Array<object>, lawControls: Array<object>,
 *   findings: Array<{ id: string, feasibility: number, lawNote: string, message: string }>
 * }}
 */
export function computeControlBar(results, { groupKey = 'group' } = {}) {
  const controls = results.filter((r) => r[groupKey] === 'control');
  const lawControls = controls.filter((c) => LAW_CONTROL.test(c.id));
  const barControls = controls.filter((c) => !LAW_CONTROL.test(c.id));

  if (barControls.length === 0) {
    throw new Error(
      'PB-SIM-CONTROLGATE-v1: a run needs at least one non-law control (nonsense or ' +
        'false-friend) to set a bar. A law control cannot serve as the floor.',
    );
  }

  const bar = Math.max(...barControls.map((c) => c.feasibility));
  const barId = barControls.find((c) => c.feasibility === bar)?.id ?? null;

  const findings = [];
  for (const lc of lawControls) {
    const caught = typeof lc.lawNote === 'string' && lc.lawNote.startsWith('LAW_VIOLATION');
    if (!caught) {
      findings.push({
        id: lc.id,
        feasibility: lc.feasibility,
        lawNote: lc.lawNote ?? 'unknown',
        message:
          `lawGate did not recognise this violation (note=${lc.lawNote}). The law it breaks ` +
          'has no rule in concept-chemistry.js LAW_RULES, so the gate is blind to it. ' +
          'Add a rule or accept that this law is unenforced.',
      });
    }
    if (!caught && lc.feasibility > bar) {
      findings.push({
        id: lc.id,
        feasibility: lc.feasibility,
        lawNote: lc.lawNote ?? 'unknown',
        message:
          `it also OUTSCORES the bar (${lc.feasibility.toFixed(4)} > ${bar.toFixed(4)}). Under ` +
          'the old rule this would have set the floor — raising the standard for every ' +
          'candidate precisely because the law gate failed to catch it.',
      });
    }
  }

  return { bar, barId, barControls, lawControls, findings };
}

/**
 * Render the control section of a run report.
 * @param {Array<object>} results
 * @param {object} [options] - same options as computeControlBar
 * @returns {string}
 */
export function formatControlReport(results, options) {
  const { bar, barId, barControls, lawControls, findings } = computeControlBar(results, options);
  const lines = [];

  lines.push('  bar-setting controls (nonsense + false friends):');
  for (const c of [...barControls].sort((a, b) => b.feasibility - a.feasibility)) {
    lines.push(`    ${c.id.padEnd(36)} ${c.feasibility.toFixed(4)}`);
  }
  lines.push('');
  lines.push(`  bar to clear: ${barId} ${bar.toFixed(4)}`);
  lines.push('');

  if (lawControls.length) {
    lines.push('  law controls (DIAGNOSTIC — these do not set the bar):');
    for (const c of lawControls) {
      const caught = typeof c.lawNote === 'string' && c.lawNote.startsWith('LAW_VIOLATION');
      lines.push(
        `    ${c.id.padEnd(36)} ${c.feasibility.toFixed(4)}  ${caught ? 'CAUGHT' : 'MISSED'} by lawGate (${c.lawNote})`,
      );
    }
    lines.push('');
  }

  if (findings.length) {
    lines.push('  ⚠ LAW GATE FINDINGS:');
    for (const f of findings) lines.push(`    ${f.id}: ${f.message}`);
    lines.push('');
  }

  return lines.join('\n');
}
