#!/usr/bin/env node
/**
 * SCHOLO GATE — Semantic Calculus in front of the CLI. SHADOW ONLY: runs nothing.
 *
 *   npx tsx scripts/scholo-gate.mjs "run the tests"
 *   npx tsx scripts/scholo-gate.mjs --log "fix the jitters"
 *
 * Rev 7: prints orthogonal epistemic fields (gap / method / warrants) without
 * splitting Theory into sub-kinds.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadCliLexicon, knownKeys, entryFor, riskFor } from '../codex/core/semantic-calculus/cliLexicon.ts';
import { lexicalProposer, validateProposal, assessMargin } from '../codex/core/semantic-calculus/proposer.ts';
import { adjudicateLaw } from '../codex/core/semantic-calculus/kind.ts';
import { deriveEpistemic } from '../codex/core/semantic-calculus/epistemic.ts';
import { bindInquiryProbe } from '../codex/core/semantic-calculus/probeRegistry.ts';
import { routeUtterance } from '../codex/core/semantic-calculus/lexicons.ts';
import {
  userUtterance,
  derivedUtterance,
  requiredConfirmation,
  confirmationsRequired,
} from '../codex/core/semantic-calculus/utterance.ts';
import {
  appendResolution,
  appendEpoch,
  appendSteerReceipt,
  readLedger,
  pendingReceipts,
  rowsSinceEpoch,
  currentEpoch,
  phase0FieldChecksum,
  OUTCOMES,
} from '../codex/core/semantic-calculus/steer-ledger.ts';
import { gateCandidates } from '../codex/core/semantic-calculus/gate-pressure.ts';

const C = { d: '\x1b[2m', b: '\x1b[1m', r: '\x1b[0m', g: '\x1b[32m', y: '\x1b[33m', c: '\x1b[36m', red: '\x1b[31m', m: '\x1b[35m' };
const KIND_COLOR = { Do: C.g, Clarify: C.y, Probe: C.c, Theory: C.m, Hypothesis: '\x1b[38;5;208m' };
const CORPUS = 'bench/semantic-calculus/corpus/cli-intents.jsonl';

const args = process.argv.slice(2);
const shouldLog = args.includes('--log');
const asJson = args.includes('--json');

/**
 * F8a — resolve a steer receipt. Appends a PB-STEER-RESOLVE-v1 row; never
 * mutates the evaluation row. A deflection nobody can mark wrong is not
 * evidence, and `deflection_was_wrong` is the only signal that can falsify
 * a weight — so this flag is what turns the Phase 0 ledger into telemetry.
 */
const flagValue = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const resolveId = flagValue('resolve');
if (resolveId !== undefined) {
  const outcome = flagValue('outcome');
  if (!outcome) {
    console.error(`usage: npx tsx scripts/scholo-gate.mjs --resolve=<steer-id> --outcome=<${OUTCOMES.join('|')}> [--deflected=<candidate-key>] [--note=<text>]`);
    process.exit(2);
  }
  try {
    const row = appendResolution({
      schema: 'PB-STEER-RESOLVE-v1',
      steer_id: resolveId,
      outcome,
      deflected_candidate: flagValue('deflected') ?? null,
      note: flagValue('note') ?? '',
    });
    console.log(`  ${C.g}resolved${C.r} ${row.steer_id} -> ${C.b}${row.outcome}${C.r}` +
      `${row.deflected_candidate ? `  ${C.d}(deflection: ${row.deflected_candidate})${C.r}` : ''}` +
      `  ${C.d}· appended, never mutated · steer-receipts.jsonl${C.r}`);
  } catch (err) {
    console.error(`${C.red}resolve refused:${C.r} ${err.message}`);
    process.exit(1);
  }
  process.exit(0);
}

/**
 * --pending — the reason Phase 0 can reach its own exit criteria.
 *
 * `--resolve=<id>` requires knowing an id, and until now nothing listed them.
 * Criterion 1 (>=40 resolved) and criterion 2 (at least one
 * deflection_was_wrong) both need a human to act on specific receipts, so a
 * receipt nobody can find is exactly as unresolvable as one with no outcome
 * field. Two weeks of that would expire at zero resolutions and read as a
 * refutation when it was only ever a missing listing.
 */
if (args.includes('--pending')) {
  const { rows } = readLedger(undefined, { strict: false });
  const window = rowsSinceEpoch(rows);
  const epoch = currentEpoch(rows);
  const pending = pendingReceipts(window);
  const resolvedCount = window.filter((r) => r.schema === 'PB-STEER-RESOLVE-v1').length;
  const limit = Number(flagValue('limit') ?? 20);

  console.log(`\n  ${C.b}steer ledger${C.r}  ${C.d}${epoch ? `epoch ${epoch.epoch} (${epoch.capturedAt})` : 'no epoch marker — whole ledger is one window'}${C.r}`);
  console.log(`  ${C.d}${window.filter((r) => r.schema === 'PB-STEER-v1').length} receipts this window · ${resolvedCount} resolved · ${C.b}${pending.length} pending${C.r}`);
  console.log(`  ${C.d}exit criteria: >=40 resolved, >=1 deflection_was_wrong${C.r}\n`);

  for (const row of pending.slice(0, limit)) {
    const c = row.candidates[0] ?? {};
    const label = c.category ? `${c.governor}/${c.category}` : String(c.governor ?? 'gate');
    console.log(`  ${C.c}${row.id}${C.r}  ${C.d}${label}${C.r}  ${String(row.utterance).slice(0, 46)}`);
    console.log(`    ${C.d}npx tsx scripts/scholo-gate.mjs --resolve=${row.id} --outcome=<${OUTCOMES.join('|')}> --deflected=${c.key ?? '<key>'}${C.r}`);
  }
  if (pending.length > limit) console.log(`\n  ${C.d}… ${pending.length - limit} more (--limit=N)${C.r}`);
  console.log('');
  process.exit(0);
}

/**
 * --epoch — re-date the measurement clock WITHOUT deleting history. Append-only
 * forbids truncating a smoke run out of the corpus; it does not forbid saying
 * "measurement starts here, and here is why the last window was abandoned".
 */
const epochLabel = flagValue('epoch');
if (epochLabel !== undefined) {
  const reason = flagValue('reason');
  if (!reason) {
    console.error('usage: npx tsx scripts/scholo-gate.mjs --epoch=<label> --reason="<why the previous window was abandoned>" [--note=<text>]');
    process.exit(2);
  }
  const row = appendEpoch({ schema: 'PB-STEER-EPOCH-v1', epoch: epochLabel, reason, note: flagValue('note') ?? '' });
  console.log(`  ${C.g}epoch${C.r} ${C.b}${row.epoch}${C.r} opened ${C.d}${row.capturedAt}${C.r}`);
  console.log(`  ${C.d}${row.reason}${C.r}`);
  console.log(`  ${C.d}earlier rows retained on disk and excluded from the fit${C.r}`);
  process.exit(0);
}

const asSteer = args.includes('--steer');
const utterance = args.filter((a) => !a.startsWith('--')).join(' ').trim();

/**
 * F21 — YOU typed this, at your own terminal. That is the one construction that
 * earns 'user', and the gate is entitled to say so.
 *
 * --derived simulates the real speaker: a model proposing an act. --taint names
 * an untrusted source in its causal chain, which is what a harness would supply
 * after the model read a page. Use them to see what the same sentence costs when
 * a machine says it rather than you.
 */
const asDerived = args.includes('--derived');
const taint = args.filter((a) => a.startsWith('--taint=')).map((a) => a.slice('--taint='.length));
const spoken = asDerived || taint.length ? derivedUtterance(utterance, taint) : userUtterance(utterance);

if (!utterance) {
  console.error('usage: npx tsx scripts/scholo-gate.mjs [--json] [--log] [--steer] [--derived] [--taint=<src>] "<what you want>"');
  console.error('       npx tsx scripts/scholo-gate.mjs --pending [--limit=N]');
  console.error('       npx tsx scripts/scholo-gate.mjs --resolve=<steer-id> --outcome=<verdict> [--deflected=<key>] [--note=<text>]');
  console.error('       npx tsx scripts/scholo-gate.mjs --epoch=<label> --reason="<why>" [--note=<text>]');
  process.exit(2);
}

const lex = loadCliLexicon();
const known = knownKeys(lex);

const proposal = { proposerId: lexicalProposer.id, slot: 'script', candidates: lexicalProposer.propose(utterance, 'script', known) };
validateProposal(proposal, known);

const top = [...proposal.candidates].sort((a, b) => b.score - a.score)[0];
const topEntry = top ? entryFor(lex, top.key) : undefined;
const risk = riskFor(topEntry?.consequence ?? 'security');

const verdict = assessMargin(proposal, risk);

// P4 — route by epistemic role BEFORE the proposer gets a vote. This gate's
// action lexicon is package.json scored fuzzily, so without this a diagnosis
// sharing one token with a script ("listen", "build") would arrive as a Do
// candidate. exactActionBind is false here because this proposer never binds
// exactly; it only ever scores.
const role = routeUtterance({ utterance, exactActionBind: false });
const inquiry = role === 'inquiry' ? bindInquiryProbe(utterance) : undefined;

let kind;
let bound = false;
let unknownReferent = false;
let hasUnresolvedSlots = false;
let needsEvidence = false;
let phase = 'atomic';
let probeNote = '';

if (role === 'inquiry' && inquiry) {
  kind = 'Probe';
  bound = true;
  needsEvidence = true;
  phase = 'plan';
  probeNote = inquiry.id;
} else if (role === 'inquiry') {
  // Claimed by inquiry, bound by nothing in it: the method is missing, not the
  // script. Never fall through to the action proposer here.
  kind = 'Theory';
} else if (verdict.reason === 'no-candidates') {
  kind = 'Theory';
} else if (!verdict.decided) {
  kind = 'Clarify';
  hasUnresolvedSlots = true;
  bound = true;
} else {
  bound = true;
  kind = entryFor(lex, verdict.pick.key)?.effect === 'read' ? 'Probe' : 'Do';
}

const law = adjudicateLaw({ kind, riskProfile: risk, utterance: spoken });
const epistemic = deriveEpistemic({
  kind,
  bound,
  hasUnresolvedSlots,
  unknownReferent,
  needsEvidence,
  hasObservationReceipts: false,
  hasGeneCites: false,
  utterance,
  // Only the inquiry role informs the gap, and only because it means a real
  // lexicon claimed and missed. 'action' is NOT passed: a miss against
  // package.json says which lexicon failed to bind, never what the speaker
  // asked for, and asserting it forced gap='command' onto every unbound Theory.
  lexiconRole: role === 'inquiry' ? 'inquiry' : undefined,
});

// F21 — 'allow' is not the whole gate. A model-proposed act is permitted and
// still unexecutable until a human ratifies it, so reporting a bare yes here
// would promise something assertExecutable refuses.
const confirmation = kind === 'Do' ? requiredConfirmation(risk.confirmationPolicy, spoken) : 'none';
const needed = confirmationsRequired(confirmation);
const wouldRun = kind === 'Do' && law.decision === 'allow' && needed === 0;
const pickEntry = verdict.pick ? entryFor(lex, verdict.pick.key) : undefined;

/**
 * --steer — emit a MULTI-CANDIDATE receipt. This is the half of Phase 0 that
 * can actually test the separability criterion: the governors emit unary
 * deflections (one candidate, one source, magnitude 1.0), which can only
 * measure per-rule precision. Here there are rivals, and each carries a real
 * four-source vector from independent producers (see gate-pressure.ts).
 *
 * Emission is flag-gated and wrapped: a telemetry failure must never change
 * what the gate prints, so the default path stays byte-identical and a throw
 * degrades to one warning line (PDR §3.2).
 */
let steerEmitted = null;
if (asSteer && proposal.candidates.length > 0) {
  try {
    const inputs = proposal.candidates.map((c) => {
      const entry = entryFor(lex, c.key);
      const candidateRisk = riskFor(entry?.consequence ?? 'security');
      const candidateKind = entry?.effect === 'read' ? 'Probe' : 'Do';
      const candidateLaw = adjudicateLaw({ kind: candidateKind, riskProfile: candidateRisk, utterance: spoken });
      const candidateConfirmation = candidateKind === 'Do'
        ? requiredConfirmation(candidateRisk.confirmationPolicy, spoken)
        : 'none';
      return {
        key: c.key,
        score: c.score,
        effect: entry?.effect,
        lawDecision: candidateLaw.decision,
        confirmationsRequired: confirmationsRequired(candidateConfirmation),
      };
    });
    // The gate selects only when it decided. Clarify and Theory are genuine
    // STALLED outcomes that are NOT governor blocks — exactly the contrast
    // the corpus was missing.
    const selected = verdict.decided && verdict.pick ? verdict.pick.key : null;
    steerEmitted = appendSteerReceipt({
      schema: 'PB-STEER-v1',
      utterance,
      candidates: gateCandidates(inputs),
      selected_trajectory: selected,
      verdict: selected ? 'PERMITTED' : 'STALLED',
      outcome: null,
      field_checksum: phase0FieldChecksum(),
    });
  } catch (err) {
    console.error(`  ${C.y}steer: degraded (${err.message}) — default path unchanged${C.r}`);
  }
}

if (asJson) {
  const payload = {
    ok: true,
    intent: utterance,
    kind,
    bound,
    pick: verdict.pick
      ? {
          key: verdict.pick.key,
          score: verdict.pick.score,
          command: pickEntry?.command ?? null,
          consequence: pickEntry?.consequence ?? null,
          effect: pickEntry?.effect ?? null,
        }
      : null,
    rival: verdict.rival
      ? { key: verdict.rival.key, score: verdict.rival.score }
      : null,
    risk: {
      consequence: risk.consequence,
      minMargin: risk.minMargin,
      confirmationPolicy: risk.confirmationPolicy,
    },
    law: { decision: law.decision, ruleIds: law.ruleIds },
    epistemic,
    phase,
    probeId: probeNote || null,
    margin: verdict.margin,
    reason: verdict.reason,
    confirmations_required: needed,
    confirmation,
    would_execute: wouldRun,
    utteranceTrust: spoken.trust,
    utteranceTaint: spoken.taint,
  };
  if (steerEmitted) payload.steer = { id: steerEmitted.id, candidates: steerEmitted.candidates.length };
  if (shouldLog) {
    mkdirSync(dirname(CORPUS), { recursive: true });
    appendFileSync(CORPUS, JSON.stringify({
      id: `cli-${Date.now().toString(36)}`,
      utterance,
      lexiconVersion: lex.version,
      proposerId: proposal.proposerId,
      candidates: proposal.candidates,
      kind,
      law: law.decision,
      epistemic,
      utteranceTrust: spoken.trust,
      utteranceTaint: spoken.taint,
      phase,
      probeId: probeNote || undefined,
      margin: verdict.margin,
      schemaVersion: 'SEMANTIC_ACT_v2',
      capturedAt: new Date().toISOString(),
    }) + '\n');
    payload.logged = CORPUS;
  }
  console.log(JSON.stringify(payload));
  process.exit(0);
}

// ── Report ──────────────────────────────────────────────────────────────────
console.log(`\n  ${C.d}${utterance}${C.r}`);
console.log(`  ${C.d}${'─'.repeat(Math.min(60, utterance.length + 2))}${C.r}`);
console.log(`  ${KIND_COLOR[kind]}${C.b}${kind}${C.r}   ${C.d}law=${law.decision}  ${law.ruleIds.join(',')}${C.r}`);
console.log(
  `  ${C.d}epistemic.gap=${epistemic.gap}  method=${epistemic.method}  phase=${phase}${C.r}`,
);
console.log(
  `  ${C.d}warrant required=[${epistemic.warrantRequired.join(',')}]  present=[${epistemic.warrantPresent.join(',')}]${C.r}`,
);
console.log(
  `  ${C.d}said by=${spoken.trust}${spoken.taint.length ? `  taint=[${spoken.taint.join(',')}]` : ''}${C.r}`,
);

if (probeNote) {
  console.log(`\n  ${C.c}Probe plan${C.r}  ${C.b}${probeNote}${C.r}`);
  console.log(`  ${C.d}Sealed method only — no observations ran. Submit receipts for a report.${C.r}`);
} else if (role === 'inquiry') {
  console.log(`\n  ${C.m}The inquiry lexicon claimed this and has no formula for it.${C.r}`);
  console.log(`  ${C.d}Not scored against package.json: a diagnosis is not a script to run.`);
  console.log(`  Write a Probe formula (observations + falsifiers) — that is the missing unit.${C.r}`);
} else if (verdict.reason === 'no-candidates') {
  console.log(`\n  ${C.m}Nothing in package.json binds this.${C.r}`);
  if (epistemic.gap === 'procedure') {
    console.log(`  ${C.d}Epistemic gap is procedure — this looks like a diagnosis, not a missing script.`);
    console.log(`  Prefer a Probe formula (inquiry lexicon) over inventing a Do.${C.r}`);
  } else if (epistemic.gap === 'command') {
    console.log(`  ${C.d}Epistemic gap is command — you have no npm script for this.`);
    console.log(`  That is a feature request; Theory is the correct kind.${C.r}`);
  } else {
    console.log(`  ${C.d}Epistemic gap is ${epistemic.gap}. Theory remains the kind.${C.r}`);
  }
} else if (!verdict.decided) {
  console.log(`\n  ${C.y}margin ${verdict.margin.toFixed(3)} < ${risk.minMargin} (${risk.consequence}) — too close to call${C.r}`);
  console.log(`  ${C.b}Did you mean:${C.r}`);
  console.log(`    ${C.g}${verdict.pick.key}${C.r}  ${C.d}${verdict.pick.score.toFixed(2)} · ${entryFor(lex, verdict.pick.key)?.command.slice(0, 46)}${C.r}`);
  console.log(`    ${C.g}${verdict.rival.key}${C.r}  ${C.d}${verdict.rival.score.toFixed(2)} · ${entryFor(lex, verdict.rival.key)?.command.slice(0, 46)}${C.r}`);
  const rest = [...proposal.candidates].sort((a, b) => b.score - a.score).slice(2, 5);
  for (const c of rest) console.log(`    ${C.d}${c.key}  ${c.score.toFixed(2)}${C.r}`);
} else {
  const e = entryFor(lex, verdict.pick.key);
  console.log(`\n  ${C.b}${verdict.pick.key}${C.r}  ${C.d}${e?.command}${C.r}`);
  console.log(`  ${C.d}margin ${verdict.margin.toFixed(3)} >= ${risk.minMargin}  ·  ${verdict.reason}  ·  ${e?.consequence}/${e?.effect}${C.r}`);
}

if (kind === 'Do' && law.decision === 'escalate' && law.ruleIds.some((r) => r.startsWith('law.utterance.'))) {
  console.log(`\n  ${C.y}Blocked on PROVENANCE, not on meaning.${C.r}`);
  console.log(`  ${C.d}The act is a Do and the words bound fine — a ${spoken.trust} speaker`);
  console.log(`  cannot authorize one. Untrusted may inform, never authorize.${C.r}`);
}

if (steerEmitted) {
  console.log(`\n  ${C.c}steer${C.r} ${C.b}${steerEmitted.id}${C.r}  ${C.d}${steerEmitted.candidates.length} rival candidate(s), ` +
    `verdict=${steerEmitted.verdict}  ·  resolve with --resolve=${steerEmitted.id}${C.r}`);
}

console.log(`\n  ${C.d}would execute:${C.r} ${wouldRun ? `${C.g}yes${C.r}` : `${C.red}NO${C.r}`}` +
  `  ${C.d}(kind=Do AND law=allow AND confirmed)  ·  nothing ran either way${C.r}`);
if (kind === 'Do' && law.decision === 'allow' && needed > 0) {
  console.log(`  ${C.y}needs ${needed} confirmation${needed > 1 ? 's' : ''} (${confirmation})${C.r}` +
    `  ${C.d}— a ${spoken.trust} speaker proposes; a human ratifies${C.r}`);
}
console.log('');

if (shouldLog) {
  mkdirSync(dirname(CORPUS), { recursive: true });
  appendFileSync(CORPUS, JSON.stringify({
    id: `cli-${Date.now().toString(36)}`,
    utterance,
    lexiconVersion: lex.version,
    proposerId: proposal.proposerId,
    candidates: proposal.candidates,
    kind,
    law: law.decision,
    epistemic,
    utteranceTrust: spoken.trust,
    utteranceTaint: spoken.taint,
    phase,
    probeId: probeNote || undefined,
    margin: verdict.margin,
    schemaVersion: 'SEMANTIC_ACT_v2',
    capturedAt: new Date().toISOString(),
  }) + '\n');
  console.log(`  ${C.d}logged -> ${CORPUS}${C.r}\n`);
}
