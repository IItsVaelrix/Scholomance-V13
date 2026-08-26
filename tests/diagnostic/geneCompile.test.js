import { describe, expect, it, vi } from 'vitest';
import {
  parseGene, bind, compileGene, admit, checksumArtifact, KIND, ADMISSION,
} from '../../scripts/gene-compile.mjs';

/**
 * The compiler proposes. The witness disposes. The checksum remembers.
 *
 * Binding is EXACT-MATCH against a lexicon, never inference — a compiler that
 * infers is an author, and an author's blind spot propagates identically into
 * every rule it emits. Where a check does not bind, the compiler says so in the
 * repo's own vocabulary (Theory / Hypothesis / Clarify) instead of guessing.
 */

const GENE = `### ENUM_FIELDS_REJECT_NON_SCALARS  (architecture · conf 0.98)
**Do:** An enum field must reject a non-scalar value, never raise on it.
**Required checks:**
- Assert reject field intent when value is non-scalar
- Assert reject field status when value is non-scalar
**Forbidden drift:**
- Do not raise TypeError on a list value — witness: {"field":"intent","value":["X"]}
- Do not accept an object value — witness: {"field":"status","value":{"a":1}}
`;

const LEXICON = [
  { id: 'reject-when', pattern: /^Assert reject field (?<field>\S+) when value is (?<condition>.+)$/ },
];

describe('parseGene', () => {
  it('reads the three sections of the gene skeleton', () => {
    const g = parseGene(GENE);
    expect(g.id).toBe('ENUM_FIELDS_REJECT_NON_SCALARS');
    expect(g.requiredChecks).toHaveLength(2);
    expect(g.forbiddenDrift).toHaveLength(2);
    expect(g.doStatement).toMatch(/must reject a non-scalar/);
  });

  it('is deterministic', () => {
    expect(parseGene(GENE)).toEqual(parseGene(GENE));
  });
});

describe('bind — the kind is a lookup, never a judgement', () => {
  it('emits Do when the form binds and every slot is filled', () => {
    const b = bind('Assert reject field intent when value is non-scalar', LEXICON);
    expect(b.kind).toBe(KIND.DO);
    expect(b.slots).toMatchObject({ field: 'intent', condition: 'non-scalar' });
  });

  it('emits Theory when nothing binds and no candidate is offered', () => {
    expect(bind('Assert the vibes are correct', LEXICON).kind).toBe(KIND.THEORY);
  });

  it('emits Hypothesis when nothing binds but the gene supplies a candidate', () => {
    const b = bind('Assert frobnication holds — candidate: `reject field frob when value is odd`', LEXICON);
    expect(b.kind).toBe(KIND.HYPOTHESIS);
    expect(b.candidate).toBe('reject field frob when value is odd');
  });

  it('records the candidate verbatim so a reviewer can test it', () => {
    const text = 'Assert x — candidate: `reject field a when value is b`';
    expect(bind(text, LEXICON).candidate).toBe('reject field a when value is b');
  });

  it('never invents a candidate the utterance did not carry', () => {
    expect(bind('Assert something unbindable', LEXICON).candidate).toBeUndefined();
  });

  it('emits Clarify — with a question naming the slot — when a slot is empty', () => {
    const b = bind('Assert reject field  when value is non-scalar', LEXICON);
    expect(b.kind).toBe(KIND.CLARIFY);
    expect(b.missingSlot).toBe('field');
    expect(b.question).toMatch(/field/);
  });

  it('never resolves a missing slot to a default', () => {
    const b = bind('Assert reject field  when value is non-scalar', LEXICON);
    expect(b.slots?.field).toBeFalsy();
    expect(b.kind).not.toBe(KIND.DO);
  });

  it('is fail-closed: an unrecognized shape is Theory, not Do', () => {
    for (const t of ['', '   ', 'Assert', 'reject field intent']) {
      expect(bind(t, LEXICON).kind).not.toBe(KIND.DO);
    }
  });
});

describe('compileGene', () => {
  it('produces a checksummed artifact', () => {
    const a = compileGene(parseGene(GENE), LEXICON);
    expect(a.checksum).toMatch(/^[0-9a-f]{12}$/);
    expect(checksumArtifact(a)).toBe(a.checksum);
  });

  it('is deterministic — same skeleton, same bytes', () => {
    const a = compileGene(parseGene(GENE), LEXICON);
    const b = compileGene(parseGene(GENE), LEXICON);
    expect(a).toEqual(b);
  });

  it('extracts an executable witness from a forbidden-drift line that carries one', () => {
    const a = compileGene(parseGene(GENE), LEXICON);
    expect(a.witnesses).toHaveLength(2);
    expect(a.witnesses[0].input).toEqual({ field: 'intent', value: ['X'] });
  });

  it('marks a drift line with no witness as UNWITNESSED rather than dropping it', () => {
    const g = parseGene(GENE.replace(' — witness: {"field":"intent","value":["X"]}', ''));
    const a = compileGene(g, LEXICON);
    expect(a.witnesses.some(w => w.unwitnessed)).toBe(true);
  });
});

describe('admit — kind is not permission', () => {
  const artifact = () => compileGene(parseGene(GENE), LEXICON);
  const flips = async () => ({ before: 'accepted', after: 'rejected' });

  it('ADMITTED only when every witness flips', async () => {
    const r = await admit(artifact(), { runWitness: flips });
    expect(r.verdict).toBe(ADMISSION.ADMITTED);
  });

  it('REJECTED when a witness fails to flip — the rule is decoration', async () => {
    const r = await admit(artifact(), {
      runWitness: async (w) => (w.input.field === 'status'
        ? { before: 'accepted', after: 'accepted' }
        : { before: 'accepted', after: 'rejected' }),
    });
    expect(r.verdict).toBe(ADMISSION.REJECTED);
    expect(r.why).toMatch(/did not flip/i);
  });

  it('counts a CRASHING baseline as a failing baseline — a crash is not a rejection', async () => {
    // Found by running this against the real enum defect: the pre-rule validator
    // did not *accept* a list value, it raised TypeError. A rule that converts a
    // crash into a clean rejection is exactly the repair we want admitted, and a
    // strict accepted->rejected flip would have thrown it out.
    const r = await admit(artifact(), { runWitness: async () => ({ before: 'crashed', after: 'rejected' }) });
    expect(r.verdict).toBe(ADMISSION.ADMITTED);
  });

  it('REJECTED when the pre-rule code already rejected the witness — no baseline failure', async () => {
    const r = await admit(artifact(), { runWitness: async () => ({ before: 'rejected', after: 'rejected' }) });
    expect(r.verdict).toBe(ADMISSION.REJECTED);
    expect(r.why).toMatch(/already/i);
  });

  it('UNCOMPILABLE when no check bound to Do', async () => {
    const g = parseGene(GENE.replace(/Assert reject field \S+ when value is non-scalar/g, 'Assert vibes'));
    const r = await admit(compileGene(g, LEXICON), { runWitness: flips });
    expect(r.verdict).toBe(ADMISSION.UNCOMPILABLE);
  });

  it('UNCOMPILABLE — never ADMITTED — when there is no executable witness', async () => {
    const g = parseGene(GENE.replace(/ — witness: \{[^}]*\}\}?/g, ''));
    const r = await admit(compileGene(g, LEXICON), { runWitness: flips });
    expect(r.verdict).toBe(ADMISSION.UNCOMPILABLE);
    expect(r.why).toMatch(/witness/i);
  });

  it('a Hypothesis check never counts toward executability', async () => {
    const g = parseGene(GENE.replace(
      /Assert reject field intent when value is non-scalar/,
      'Assert frob — candidate: `reject field frob when value is odd`',
    ).replace(/Assert reject field status when value is non-scalar/, 'Assert bar'));
    const r = await admit(compileGene(g, LEXICON), { runWitness: flips });
    expect(r.verdict).toBe(ADMISSION.UNCOMPILABLE);
  });

  it('reports every unbound check by kind instead of silently dropping it', async () => {
    const g = parseGene(GENE.replace(/Assert reject field status when value is non-scalar/, 'Assert vibes'));
    const r = await admit(compileGene(g, LEXICON), { runWitness: flips });
    expect(r.unbound).toEqual([{ text: 'Assert vibes', kind: KIND.THEORY }]);
  });

  it('refuses an artifact whose checksum does not match its content', async () => {
    const a = artifact();
    a.checks[0].slots.field = 'tampered';
    const r = await admit(a, { runWitness: flips });
    expect(r.verdict).toBe(ADMISSION.REJECTED);
    expect(r.why).toMatch(/checksum/i);
  });

  it('runs every witness rather than stopping at the first success', async () => {
    const seen = vi.fn(async () => ({ before: 'accepted', after: 'rejected' }));
    await admit(artifact(), { runWitness: seen });
    expect(seen).toHaveBeenCalledTimes(2);
  });
});
