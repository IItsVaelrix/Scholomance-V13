#!/usr/bin/env tsx
/**
 * MemoryIR L2 — transport conformance driver.
 *
 * Measures whether a memory record survives being rendered to prose by one
 * model and read back by another. There is NO judge: the models supply slot
 * VALUES, this script supplies the hashing, and `compareSCD64ByBlocks` decides.
 *
 *   npx tsx scripts/memoryir-l2.ts vocab
 *   npx tsx scripts/memoryir-l2.ts render MEM_PREF_DEFEASIBLE   # -> prompt for model A
 *   npx tsx scripts/memoryir-l2.ts encode "<prose from model A>" # -> prompt for model B
 *   npx tsx scripts/memoryir-l2.ts score MEM_PREF_DEFEASIBLE '<json from model B>'
 *
 *   npx tsx scripts/memoryir-l2.ts lint MEM_PREF_DEFEASIBLE '<prose>'          # -> blind-reader prompt
 *   npx tsx scripts/memoryir-l2.ts lint MEM_PREF_DEFEASIBLE '<prose>' '<j1>' '<j2>' '<j3>'
 *
 * `lint` is the PRODUCTION check of §10, not a trial instrument. It asks whether a
 * paragraph carries its record; `score` asks whether a representation survives a
 * model pair. Linting inside a trial spends the trial and inflates the pass rate.
 *
 * A run is one trial. Record which model played A and which played B — the
 * result is a property of the PAIR and the direction, not of either model.
 */
import {
  SCD64_SLOT_NAMES,
  MEMORY_SLOT_ALIASES,
  MEMORY_SLOT_VOCAB,
  MEMORY_UNBOUND,
} from '../src/core/scd64/constants';
import { MEMORY_FAMILIES } from '../src/core/scd64/glossary';
import { familyRecord, scoreTransport, memoryRecordToSCD64 } from '../src/core/scd64/memoryTransport';

const [command, ...rest] = process.argv.slice(2);
const alias = (slot: string) => MEMORY_SLOT_ALIASES[slot as keyof typeof MEMORY_SLOT_ALIASES];

function vocabBlock(): string {
  return SCD64_SLOT_NAMES
    .map((s) => `  ${alias(s).padEnd(11)} ${MEMORY_SLOT_VOCAB[s].join(' | ')}`)
    .join('\n');
}

/**
 * The one pair a reader cannot separate without being told. Silence is not a
 * declaration: a record that never mentions carve-outs is UNBOUND, not
 * none-declared. Without this gloss readers snap silence to none-declared about
 * 60% of the time (measured 2026-08-22, 3 of 5 on identical prose).
 */
/**
 * Slots that carry an explicit "the question was not examined" value. These are
 * the slots where silence is dangerous: a reader can reach the affirmative value
 * without the text supporting it, so the record needs a way to say "we did not
 * look" that is distinct from both the finding and the reader's abstention.
 */
const NOT_EXAMINED_VALUE: Record<string, string> = {
  MASKING: 'never-considered',
  VERDICT: 'never-stated',
};

function maskingGloss(): string {
  return [
    'On EXCEPTION, these three are different answers and must not be merged:',
    '  none-declared    the text says carve-outs were looked for and there are none',
    '  never-considered the text says the question was not examined',
    `  ${MEMORY_UNBOUND}          the text simply does not raise carve-outs at all`,
    'Silence is the third one. Do not read it as either of the first two.',
  ].join('\n');
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

switch (command) {
  case 'vocab': {
    console.log('MemoryIR v1 — closed slot vocabulary\n');
    console.log(vocabBlock());
    console.log(`\nAny slot may be answered ${MEMORY_UNBOUND}. Doing so is an ABSTENTION and`);
    console.log('is scored separately from a wrong answer. Guessing a plausible value is the');
    console.log('failure this vocabulary exists to prevent — abstain instead.');
    break;
  }

  case 'render': {
    const family = rest[0];
    if (!family || !(MEMORY_FAMILIES as any)[family]) {
      die(`usage: render <family>\nfamilies: ${Object.keys(MEMORY_FAMILIES).join(', ')}`);
    }
    const record = familyRecord(family);
    console.log('=== PROMPT FOR MODEL A (render) — paste everything below ===\n');
    console.log('Here is one memory record in MemoryIR v1, given as slot values:\n');
    for (const s of SCD64_SLOT_NAMES) console.log(`  ${alias(s).padEnd(11)} ${record[s]}`);
    console.log('\nWrite this memory as ONE short paragraph of natural English, the way it would');
    console.log('appear in a project memory file. Do not mention MemoryIR, slots, or these value');
    console.log('names. Do not add qualifications the record does not contain. Prose only.');
    break;
  }

  case 'encode': {
    const prose = rest.join(' ').trim();
    if (!prose) die('usage: encode "<prose>"');
    console.log('=== PROMPT FOR MODEL B (encode) — paste everything below ===\n');
    console.log('Read this project memory:\n');
    console.log(`  "${prose}"\n`);
    console.log('Encode it as MemoryIR v1. Choose EXACTLY ONE value per slot from these lists:\n');
    console.log(vocabBlock());
    console.log(`\n${maskingGloss()}`);
    console.log(`\nIf the memory does not determine a slot, answer ${MEMORY_UNBOUND} for it. Do NOT`);
    console.log('guess a plausible value — an abstention is scored separately and is not a');
    console.log('penalty. Reply with ONLY a JSON object keyed by the WIRE slot names:\n');
    console.log(`  {${SCD64_SLOT_NAMES.map((s) => `"${s}":"…"`).join(',')}}`);
    break;
  }

  case 'score': {
    const [family, json] = rest;
    if (!family || !json) die('usage: score <family> \'<json>\'');
    let returned: Record<string, string>;
    try {
      returned = JSON.parse(json);
    } catch {
      die('[MemoryIR] model B did not return parseable JSON — that is itself a transport failure');
    }

    const result = scoreTransport(family, returned);
    const expected = familyRecord(family);

    console.log(`family      ${family}`);
    console.log(`expected    ${result.expectedWire}`);
    console.log(`returned    ${result.actualWire}`);
    console.log(`relationship ${result.relationship}   similarity ${(result.similarity * 100).toFixed(0)}%`);
    console.log('');
    for (const s of SCD64_SLOT_NAMES) {
      const same = returned[s] === expected[s];
      const abstain = returned[s] === MEMORY_UNBOUND && !same;
      const mark = same ? ' ok ' : abstain ? 'ABST' : 'DRIFT';
      console.log(`  ${mark.padEnd(6)} ${alias(s).padEnd(11)} expected ${expected[s].padEnd(30)} got ${returned[s]}`);
    }
    console.log('');
    console.log(result.pass
      ? 'PASS — the record survived the round trip intact.'
      : `FAIL — ${result.drifted.length} drifted, ${result.abstained.length} abstained.`);
    process.exit(result.pass ? 0 : 1);
  }

  case 'lint': {
    const [family, paragraph, json] = rest;
    if (!family || !(MEMORY_FAMILIES as any)[family] || !paragraph) {
      die(
        `usage: lint <family> '<paragraph>' ['<json>' '<json>' '<json>' ...]\n` +
        `families: ${Object.keys(MEMORY_FAMILIES).join(', ')}\n\n` +
        `  without replies — prints the prompt to hand a blind reader\n` +
        `  with replies    — names the slots the prose failed to carry;\n` +
        `                    pass 3+ independent reads, one read is not a lint`,
      );
    }

    if (!json) {
      console.log('=== RENDER-TIME LINT (§10) — PRODUCTION USE ONLY ===\n');
      console.log('Do NOT run this inside a trial. A lint IS an encode, so it spends the trial,');
      console.log('and rewriting until it passes selects for renders your reader happens to');
      console.log('agree with (§5.4). Inside a trial, Role A gets the §5.6 coverage check only.\n');
      console.log('The reader below MUST NOT have seen the slot values. If it wrote this');
      console.log('paragraph — or you paste this into the session that did — it already knows');
      console.log('the answers, the lint cannot fail, and it measures nothing.\n');
      console.log('--- hand everything below to a blind reader ---\n');
      console.log('Read this project memory:\n');
      console.log(`  "${paragraph}"\n`);
      console.log('Encode it as MemoryIR v1. Choose EXACTLY ONE value per slot from these lists:\n');
      console.log(vocabBlock());
      console.log(`\n${maskingGloss()}`);
      console.log(`\nIf the memory does not determine a slot, answer ${MEMORY_UNBOUND} for it. Do NOT`);
      console.log('guess a plausible value — an abstention is scored separately and is not a');
      console.log('penalty. Reply with ONLY a JSON object keyed by the WIRE slot names:\n');
      console.log(`  {${SCD64_SLOT_NAMES.map((s) => `"${s}":"…"`).join(',')}}`);
      console.log('\n--- then feed the reply back ---\n');
      console.log(`  npx tsx scripts/memoryir-l2.ts lint ${family} '<the same paragraph>' '<json>' '<json>' '<json>'`);
      console.log('');
      console.log('Ask at least three independent readers. A value a reader can produce from');
      console.log('silence — `none-declared` above all — will not come back the same every time.');
      break;
    }

    const replies = [json, ...rest.slice(3)];
    const parsed: Record<string, string>[] = [];
    for (const [i, raw] of replies.entries()) {
      let obj: Record<string, string>;
      try {
        obj = JSON.parse(raw);
      } catch {
        die(`[MemoryIR] reader ${i + 1} did not return parseable JSON — the render is unlinted, which is not the same as clean`);
      }
      try {
        scoreTransport(family, obj as any);
      } catch (err) {
        die(`[MemoryIR] reader ${i + 1} answered outside the closed vocabulary — ${(err as Error).message}`);
      }
      parsed.push(obj);
    }

    const expected = familyRecord(family);
    console.log(`lint        ${family}`);
    console.log(`paragraph   "${paragraph.length > 92 ? `${paragraph.slice(0, 89)}…` : paragraph}"`);
    console.log(`readers     ${parsed.length}`);
    if (parsed.length < 3) {
      console.log('');
      console.log('  ! one or two reads is not a lint. On 2026-08-22 the same reader returned');
      console.log('    `none-declared` 3 times and UNBOUND 2 times for the SAME paragraph — the');
      console.log('    value a reader can produce from silence is the one that will not hold');
      console.log('    still. Pass at least three independent replies.');
    }
    console.log('');

    let failures = 0;
    for (const slot of SCD64_SLOT_NAMES) {
      const votes = parsed.map((r) => r[slot]);
      const tally = new Map<string, number>();
      for (const v of votes) tally.set(v, (tally.get(v) ?? 0) + 1);

      const split = [...tally.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([v, n]) => `${v} x${n}`)
        .join(', ');
      const affirmative = [...tally.keys()].filter((v) => v !== MEMORY_UNBOUND);

      // What the prose actually encodes when it does not raise the slot. This is
      // the detection device: silence is not an absence of information, it is a
      // positive reading — the record reads as one that never examined this.
      const notExamined = NOT_EXAMINED_VALUE[slot];
      const silenceNote = notExamined && expected[slot] !== notExamined
        ? ` → this prose encodes \`${notExamined}\`, not \`${expected[slot]}\``
        : '';

      let mark: string;
      let note = '';
      if (tally.size === 1 && votes[0] === expected[slot]) {
        mark = ' ok ';
      } else if (tally.size === 1 && votes[0] === MEMORY_UNBOUND) {
        mark = 'SILENT';
        note = `— every reader abstained; the prose does not raise this${silenceNote}`;
      } else if (tally.size === 1) {
        mark = 'MISSTATED';
        note = `— the prose reads as \`${votes[0]}\``;
      } else if (tally.has(MEMORY_UNBOUND) && affirmative.length === 1) {
        mark = 'HALF-SAID';
        note = `— ${split}; some readers abstained, the rest inferred it${silenceNote}`;
      } else {
        mark = 'AMBIGUOUS';
        note = `— readers disagree on what the prose says: ${split}`;
      }
      if (mark !== ' ok ') failures += 1;
      console.log(`  ${mark.padEnd(15)} ${alias(slot).padEnd(11)} ${expected[slot].padEnd(18)} ${note}`);
    }

    console.log('');
    if (failures === 0) {
      console.log(`CLEAN — ${parsed.length} blind readers independently recovered all eight slots.`);
      console.log('        The prose carries the record. This is one paragraph and this many');
      console.log('        readers; it licenses no claim about transport in general (§9).');
    } else {
      console.log(`UNDERSPECIFIED — ${failures} slot${failures === 1 ? '' : 's'} did not survive.`);
      console.log('        Fix the PARAGRAPH, not the vocabulary. A slot the prose never carried');
      console.log('        cannot be recovered by any reader, and calling that a vocabulary defect');
      console.log('        hides the real one (§5.6).');
      console.log('');
      console.log('        SILENT and HALF-SAID are the ones to read carefully. Neither means the');
      console.log('        readers failed. They mean the prose does not raise the slot, so it reads');
      console.log('        as a record that never examined it — which for EXCEPTION and UNBINDS_IF');
      console.log('        is a real, different record, not a gap. Two fixes, and only you know');
      console.log('        which applies: if the record DID examine it, state the finding outright;');
      console.log('        if it never did, set the slot to that `never-*` value and render THAT.');
      console.log('        Do not reach for the affirmative value just because it clears the lint.');
    }
    process.exit(failures === 0 ? 0 : 1);
  }

  case 'selftest': {
    // The harness must pass its own trivial case, or a green run means nothing.
    for (const family of Object.keys(MEMORY_FAMILIES)) {
      const r = scoreTransport(family, familyRecord(family));
      const wire = memoryRecordToSCD64(familyRecord(family));
      console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${family.padEnd(21)} ${wire}`);
      if (!r.pass) process.exit(1);
    }
    console.log('\nself-test green — the scorer accepts a faithful record.');
    break;
  }

  default:
    console.log('usage: memoryir-l2 <vocab|render|encode|score|lint|selftest>');
    process.exit(1);
}
