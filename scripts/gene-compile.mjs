#!/usr/bin/env node
/**
 * GENE COMPILER — skeleton in, checksummed rule artifact out.
 *
 * The problem this exists for: every rule in this repo that failed did so
 * because its author could not imagine the case it missed. Deriving the rule
 * from a declarative skeleton moves authorship out of the implementer's head.
 * But a compiler that *infers* meaning is just another author, and worse than a
 * human one — a single systematic misreading propagates identically into every
 * rule it emits, producing hundreds of rules that agree with each other because
 * they share one blind spot. A perfectly self-consistent fiction, mass-produced.
 *
 * So the division of labour is:
 *
 *   the compiler PROPOSES  — binds by exact lexicon match, never inference
 *   the witness DISPOSES   — a rule is admitted only if its forbidden-drift
 *                            witnesses FLIP: accepted before, rejected after
 *   the checksum REMEMBERS — same skeleton, same bytes, or the artifact is void
 *
 * Because admission is decided by the witness rather than by the derivation,
 * the compiler is untrusted infrastructure. You never have to audit its
 * reasoning: a rule that cannot demonstrate its own witnesses flipping does not
 * get in, however elegant the derivation that produced it.
 *
 * The kinds are not invented here. They are the repo's own semantic law:
 *
 *   Do          the form binds and every slot is filled          → executable
 *   Clarify     the form binds, a required slot is unresolved    → one question
 *   Hypothesis  nothing binds, but the gene supplied a candidate → verbatim
 *   Theory      nothing binds and no candidate was offered       → fail-closed
 *
 * Only Do is executable. A slot is never resolved to a default — the soft Do is
 * the failure the whole architecture exists to prevent.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const KIND = { DO: 'Do', CLARIFY: 'Clarify', HYPOTHESIS: 'Hypothesis', THEORY: 'Theory' };
export const ADMISSION = { ADMITTED: 'ADMITTED', REJECTED: 'REJECTED', UNCOMPILABLE: 'UNCOMPILABLE' };

/** Key-sorted JSON so the checksum is a function of content, not of key order. */
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function checksumArtifact(artifact) {
  const { checksum: _ignored, ...content } = artifact;
  return createHash('sha256').update(stableJson(content)).digest('hex').slice(0, 12);
}

export function parseGene(text) {
  const header = text.match(/^###\s+(?<id>\S+)(?:\s+\((?<domain>[^)]*)\))?/m);
  const doStatement = (text.match(/\*\*Do:\*\*\s*(.+)/) || [])[1]?.trim() ?? '';
  const section = (name) => {
    const block = text.split(`**${name}:**`)[1];
    if (!block) return [];
    const out = [];
    for (const raw of block.split('\n').slice(1)) {
      const line = raw.trim();
      if (!line.startsWith('- ')) break;
      out.push(line.slice(2).trim());
    }
    return out;
  };
  return {
    id: header?.groups?.id ?? null,
    domain: header?.groups?.domain?.trim() ?? null,
    doStatement,
    requiredChecks: section('Required checks'),
    forbiddenDrift: section('Forbidden drift'),
  };
}

/**
 * A lenient twin of a lexicon pattern: every named slot's sub-expression is
 * replaced by a lazy wildcard, so a form with an EMPTY required slot still
 * recognizes as that form. Derived mechanically from the strict pattern -- the
 * lexicon author writes one regex, not two, and the compiler infers nothing.
 */
function lenientPattern(pattern) {
  const src = pattern.source;
  let out = '';
  for (let i = 0; i < src.length; i += 1) {
    const open = src.startsWith('(?<', i) && src[i + 3] !== '=' && src[i + 3] !== '!';
    if (!open) { out += src[i]; continue; }
    const nameEnd = src.indexOf('>', i);
    let depth = 0, j = i;
    for (; j < src.length; j += 1) {
      if (src[j] === '(' && src[j - 1] !== '\\') depth += 1;
      else if (src[j] === ')' && src[j - 1] !== '\\') { depth -= 1; if (depth === 0) break; }
    }
    out += `${src.slice(i, nameEnd + 1)}.*?)`;
    i = j;
  }
  return new RegExp(out, pattern.flags);
}

const clarify = (entry, slots, missing) => ({
  kind: KIND.CLARIFY, form: entry.id, slots, missingSlot: missing,
  // Exactly one bounded question, naming the slot. Never "what do you mean?".
  question: `Which value fills the required slot \`${missing}\` in form \`${entry.id}\`?`,
});

/** Exact-match binding. A lookup, not a judgement. */
export function bind(text, lexicon) {
  const trimmed = String(text ?? '').trim();

  for (const entry of lexicon) {
    const m = trimmed.match(entry.pattern);
    if (!m) continue;
    const slots = { ...m.groups };
    const missing = Object.keys(slots).find((k) => !slots[k] || !String(slots[k]).trim());
    if (missing) return clarify(entry, slots, missing);
    return { kind: KIND.DO, form: entry.id, slots };
  }

  // The form may be present with a slot left unresolved. That is Clarify -- one
  // bounded question -- and emphatically not a default quietly filled in.
  for (const entry of lexicon) {
    const m = trimmed.match(lenientPattern(entry.pattern));
    if (!m) continue;
    const slots = { ...m.groups };
    const missing = Object.keys(slots).find((k) => !slots[k] || !String(slots[k]).trim());
    if (missing) return clarify(entry, slots, missing);
  }

  // Unbound. A candidate must come from the utterance, or the machine is
  // guessing and calling it the author's idea.
  const candidate = trimmed.match(/candidate:\s*`([^`]+)`/)?.[1];
  if (candidate) return { kind: KIND.HYPOTHESIS, candidate };
  return { kind: KIND.THEORY };
}

/** A forbidden-drift line yields an executable witness only if it carries one. */
function parseWitness(line) {
  const at = line.indexOf('witness:');
  if (at === -1) return { text: line, unwitnessed: true, why: 'no executable witness — never asked, not clean' };
  try {
    return { text: line.slice(0, at).replace(/[—-]\s*$/, '').trim(), input: JSON.parse(line.slice(at + 'witness:'.length).trim()) };
  } catch (error) {
    return { text: line, unwitnessed: true, why: `witness is not parseable JSON: ${String(error.message).slice(0, 60)}` };
  }
}

export function compileGene(gene, lexicon) {
  const artifact = {
    geneId: gene.id,
    doStatement: gene.doStatement,
    checks: gene.requiredChecks.map((text) => ({ text, ...bind(text, lexicon) })),
    witnesses: gene.forbiddenDrift.map(parseWitness),
    lexiconIds: lexicon.map((l) => l.id).sort(),
  };
  return { ...artifact, checksum: checksumArtifact(artifact) };
}

/**
 * Kind is not permission. Being a `Do` says the rule is executable; only the
 * witnesses say it may enter the ledger.
 */
export async function admit(artifact, { runWitness } = {}) {
  const unbound = artifact.checks
    .filter((c) => c.kind !== KIND.DO)
    .map((c) => ({ text: c.text, kind: c.kind }));

  if (checksumArtifact(artifact) !== artifact.checksum) {
    return { verdict: ADMISSION.REJECTED, unbound, why: 'checksum does not match content — the artifact was edited after compilation' };
  }

  const executable = artifact.checks.filter((c) => c.kind === KIND.DO);
  if (executable.length === 0) {
    return { verdict: ADMISSION.UNCOMPILABLE, unbound, why: 'no required check bound to an executable form — never asked, NOT clean' };
  }

  const runnable = artifact.witnesses.filter((w) => !w.unwitnessed);
  if (runnable.length === 0) {
    return { verdict: ADMISSION.UNCOMPILABLE, unbound, why: 'no executable witness — a rule that cannot be made to fail cannot be admitted' };
  }

  const results = [];
  for (const witness of runnable) {
    const outcome = await runWitness(witness, artifact);
    results.push({ witness: witness.text, ...outcome });
  }

  // The baseline must FAIL. A crash is a failure -- the real enum defect raised
  // TypeError rather than accepting, and a repair that turns a crash into a clean
  // rejection is precisely what should be admitted. Only an already-correct
  // rejection means the baseline never failed.
  const FAILING_BASELINE = new Set(['accepted', 'crashed']);
  const alreadyRejected = results.filter((r) => !FAILING_BASELINE.has(r.before));
  if (alreadyRejected.length > 0) {
    return {
      verdict: ADMISSION.REJECTED, unbound, results,
      why: `${alreadyRejected.length} witness(es) were already rejected before the rule existed — the baseline did not fail, so the rule proves nothing`,
    };
  }
  const stuck = results.filter((r) => r.after !== 'rejected');
  if (stuck.length > 0) {
    return {
      verdict: ADMISSION.REJECTED, unbound, results,
      why: `${stuck.length} witness(es) did not flip — the rule is decoration`,
    };
  }

  return {
    verdict: ADMISSION.ADMITTED, unbound, results,
    rules: executable.map((c) => ({ form: c.form, slots: c.slots })),
    // Report the baseline states that actually occurred. Hardcoding "accepted"
    // here described a run that did not happen -- both real witnesses crashed.
    why: `all ${results.length} witnesses flipped: ${[...new Set(results.map((r) => r.before))].sort().join('/')} before the rule, rejected after`,
  };
}

async function main() {
  const geneIndex = process.argv.indexOf('--gene');
  if (geneIndex === -1) {
    console.error('usage: gene-compile.mjs --gene <gene.md> [--lexicon <lexicon.json>]');
    process.exit(2);
  }
  const gene = parseGene(readFileSync(process.argv[geneIndex + 1], 'utf8'));
  const lexIndex = process.argv.indexOf('--lexicon');
  const lexicon = lexIndex === -1 ? [] : JSON.parse(readFileSync(process.argv[lexIndex + 1], 'utf8'))
    .map((l) => ({ ...l, pattern: new RegExp(l.pattern) }));
  const artifact = compileGene(gene, lexicon);
  console.log(JSON.stringify(artifact, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
