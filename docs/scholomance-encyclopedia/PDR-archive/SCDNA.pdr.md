# PDR: Retrieval Genome Protocol

## SCDNA: Scholomance Cognitive DNA

## 1. Summary

**Retrieval Genome Protocol**, also called **SCDNA**, is a machine-parseable genetic code system for Vaelrix memory retrieval.

Instead of relying only on semantic search, embedding similarity, file lookup, or raw memory chunks, every important retrievable object receives a compact **retrieval gene**.

A retrieval gene is a structured fingerprint that tells Vaelrix:

```txt
What this memory is
Where it belongs
Which brains should activate
How trustworthy it is
What instruction it implies
What risks are attached
How to translate the code into English
```

This turns memory retrieval into **memory expression**.

Normal retrieval says:

```txt
Find relevant text.
```

SCDNA says:

```txt
Decode the memory gene.
Wake the right Amplifiers.
Translate the encoded instruction.
Apply the memory correctly.
```

This is the third major upgrade in the Vaelrix stack:

```txt
1. Amplifier Cortex
   More specialized brains.

2. Scholomance ForceField
   Shared law, routing, memory discipline, and search governance.

3. Retrieval Genome Protocol
   Encoded memory DNA that converts fingerprints into executable retrieval instructions.
```

---

## 2. Classification

**Change type:** Architectural + behavioral + retrieval-layer upgrade

**Primary system affected:** Vaelrix memory substrate

**Secondary systems affected:**

```txt
TurboQuant substrate
Amplifier Cortex
Scholomance ForceField
Search Governor
Council Arbiter
Memory Ledger
Tool-call router
Code debugging flow
Creative critique flow
Lore/canon recall
PixelBrain recall
Rhyme/phoneme recall
```

---

## 3. Why This Exists

Current retrieval systems often work like this:

```txt
User task
  ↓
Semantic search
  ↓
Retrieve candidate chunks
  ↓
Model interprets chunks
  ↓
Model decides what the chunks mean
  ↓
Model decides what to do
```

This creates several problems:

```txt
1. The same memory can be searched repeatedly.
2. Retrieved chunks may require too much interpretation.
3. The model can misread why a memory matters.
4. Semantic similarity can retrieve adjacent but wrong context.
5. Important operational instructions may be buried inside text.
6. The agent may know what a chunk says, but not what it means for action.
```

SCDNA solves this by giving each important memory a compact code that decodes into routing, confidence, instruction, and English meaning.

The goal is not just to retrieve memory faster.

The goal is to retrieve memory **with instructions attached**.

---

## 4. Core Concept

A retrieval gene has two jobs:

```txt
1. Identify the memory.
2. Tell the system how to use the memory.
```

A normal hash can identify content, but it cannot explain itself.

Example:

```txt
9f86d081884c7d659a2feaa0c55ad015...
```

This can verify identity, but it does not tell Vaelrix:

```txt
This is a phoneme/UI bug.
Activate Code Brain and Phoneme Brain.
Do not let frontend fallback recompute backend truth.
Run rendering regression tests.
```

So SCDNA separates identity from meaning.

```txt
Fingerprint = stable identity
Genome      = machine-readable meaning and instruction
Expression  = English translation plus activated behavior
```

---

## 5. Product Vision

The Retrieval Genome Protocol turns the memory substrate into a living symbolic index.

Each important memory has a gene.

Each gene can be decoded.

Each decoded gene can activate brains, guide retrieval, block bad assumptions, and translate machine structure into human-readable instruction.

The system becomes:

```txt
Memory object
  ↓
Retrieval gene
  ↓
Gene decoder
  ↓
English instruction
  ↓
Amplifier routing
  ↓
ForceField governance
  ↓
Vaelrix action
```

Mythically:

```txt
TurboQuant = compressed blood-memory
Amplifiers = organs
ForceField = law
SCDNA = genetic code
Vaelrix Core = consciousness
```

SCDNA gives Vaelrix inherited operational memory.

---

## 6. Goals

### G1. Reduce retrieval ambiguity

Vaelrix should know why a memory matters, not merely that it exists.

### G2. Reduce repeated search

If a gene directly resolves a task, the system should decode the gene before performing broad search.

### G3. Improve routing

Genes should activate the correct Amplifier brains.

Example:

```txt
SCDNA says PHONEME_UI_BUG
  ↓
Activate:
  CODE_BRAIN
  PHONEME_BRAIN
  UI_BRAIN
  RISK_BRAIN
```

### G4. Convert math/code into English

The genome must be machine-parseable, but it must also translate into stable English instructions.

### G5. Preserve determinism

The same gene should always decode into the same meaning under the same decoder version.

### G6. Support confidence and freshness

Genes must indicate whether a memory is trusted, stale, experimental, canonical, or dangerous.

### G7. Improve hallucination resistance

The decoded gene should narrow the interpretation space.

Instead of guessing:

```txt
Maybe this chunk means X.
```

Vaelrix receives:

```txt
This gene means X. Use it for Y. Do not use it for Z.
```

---

## 7. Non-Goals

SCDNA does not aim to:

```txt
Replace semantic search completely
Replace TurboQuant
Replace human judgment
Encode every trivial memory
Turn all memories into opaque hashes
Allow genes to silently override evidence
Create irreversible memory tags
Make stale memory look authoritative
Automatically generate genes from observed behavior
```

## 7.1 Gene Curation Policy

Genes are **manually curated**, not machine-generated.

The SCDNA compiler is a tool for authoring, validating, and registering genes. It surfaces candidates and enforces structure, but a human decides whether a memory deserves to become a gene. This mirrors the Cleri-RAID pattern: detection assists, curation decides.

Rules:

```txt
- A gene must encode a recurring, high-value operational memory.
- A gene must have a falsifiable instruction.
- A gene must be reviewed before it enters the canonical registry.
- The compiler may reject, warn, or emit a gene, but it may not add it without approval.
- Genes are preserved in registry history even when deprecated; nothing is silently deleted.
```

SCDNA should improve retrieval precision without making Vaelrix brittle.

---

## 8. System Placement

SCDNA sits between the ForceField and TurboQuant substrate.

```txt
User Request
   ↓
Vaelrix Core
   ↓
Scholomance ForceField
   ↓
SCDNA Gene Detector
   ↓
SCDNA Decoder
   ↓
TurboQuant Retrieval
   ↓
Amplifier Cortex
   ↓
Council Arbiter
   ↓
Action / Response / Patch
```

SCDNA is not the entire memory system.

It is the **instructional layer** attached to memory.

---

## 9. Core Data Model

## 9.1 Retrieval Gene

```ts
export type RetrievalGene = {
  version: "SCDNA-v1";

  identity: GeneIdentity;
  domain: GeneDomain;
  retrieval: GeneRetrieval;
  instruction: GeneInstruction;
  risk: GeneRisk;
  english: GeneEnglish;
  lifecycle: GeneLifecycle;
};
```

---

## 9.2 Gene Identity

```ts
export type GeneIdentity = {
  stableId: string;
  contentHash: string;
  sourceKind:
    | "file"
    | "memory"
    | "test"
    | "bug"
    | "lyric"
    | "sprite"
    | "tool"
    | "rule"
    | "architecture"
    | "workflow";
};
```

### Purpose

Identity answers:

```txt
What object does this gene refer to?
Is this the same object as before?
Can this gene be used for exact lookup?
```

---

## 9.3 Gene Domain

```ts
export type GeneDomain = {
  primary:
    | "code"
    | "rhyme"
    | "phoneme"
    | "pixel"
    | "lore"
    | "audio"
    | "seo"
    | "memory"
    | "testing"
    | "architecture"
    | "risk";

  secondary: string[];
  activationBrains: string[];
};
```

### Purpose

Domain answers:

```txt
Which layer of Vaelrix does this memory belong to?
Which Amplifier brains should activate?
Which brains should remain asleep?
```

---

## 9.4 Gene Retrieval

```ts
export type GeneRetrieval = {
  lookupMode: "exact" | "semantic" | "hybrid" | "symbolic";
  priority: number;
  confidence: number;
  originalConfidence: number;
  freshness: number;
  canonical: boolean;
  minConfidence: number;
};
```

### Meaning

```txt
lookupMode  = how the memory should be retrieved
priority    = how urgently it should be considered
confidence  = trust level of the gene
freshness   = whether the memory may be stale
canonical   = whether this is an official system truth
```

---

## 9.5 Gene Instruction

```ts
export type GeneInstruction = {
  action:
    | "recall"
    | "warn"
    | "route"
    | "compare"
    | "block"
    | "test"
    | "critique"
    | "summarize"
    | "patch"
    | "audit";

  imperative: string;
  forbiddenDrift: string[];
  requiredChecks: string[];
};
```

### Purpose

Instruction answers:

```txt
What should Vaelrix do with this memory?
What mistakes should be prevented?
What checks should happen before action?
```

---

## 9.6 Gene Risk

```ts
export type GeneRisk = {
  riskClass: "low" | "medium" | "high" | "critical";
  blastRadius: "local" | "module" | "cross_system" | "global";
  staleRisk: number;
  misuseRisk: number;
};
```

### Purpose

Risk answers:

```txt
How dangerous is it to use this memory incorrectly?
How many systems could break?
How likely is this memory stale?
```

---

## 9.7 Gene English

```ts
export type GeneEnglish = {
  shortMeaning: string;
  expandedMeaning: string;
  operatorInstruction: string;
};
```

### Purpose

English answers:

```txt
How should the mathematical code be explained to the agent?
How should Vaelrix phrase this to the user if needed?
What operational instruction should the system obey?
```

---

## 9.8 Gene Lifecycle

```ts
export type GeneLifecycle = {
  status: "active" | "degraded" | "deprecated" | "conflicted" | "quarantined";
  contradictionCount: number;
  lastContradictionAtIndex: number | null;
  degradationFactor: number;
  recoveryIncrement: number;
  deprecationThreshold: number;
  supersededBy?: string;
  quarantineReason?: string;
};
```

### Purpose

Lifecycle answers:

```txt
Is this gene still trustworthy?
How many times has it contradicted itself or other evidence?
Has it been replaced by a better gene?
Why was it quarantined or deprecated?
```

Genes degrade with each contradiction and recover slowly with consistent correct use. A deprecated gene is preserved for audit but no longer activates.

---

## 10. Compact Gene String Format

The full JSON gene is useful for storage and debugging.

For fast runtime matching, SCDNA also supports compact strings.

### Format

```txt
SCDNA:v1:<SOURCE>:<DOMAIN>:<ACTION>:<BRAINS>:<CONF>:<FLAGS>
```

### Example

```txt
SCDNA:v1:BUG:PHONEME_UI:WARN:CODE+PHONEME+UI+RISK:98:NO_FRONTEND_FALLBACK+RUN_REGRESSION_TESTS
```

### Decoded English

```txt
This is a high-confidence bug memory in the phoneme/UI domain.
Activate Code Brain, Phoneme Brain, UI Brain, and Risk Brain.
Warn the system not to let frontend fallback logic recompute backend phoneme truth.
Run targeted regression tests before accepting the fix.
```

---

## 11. Example Gene: Color Dragon Bug Pattern

```ts
export const colorDragonFallbackGene: RetrievalGene = {
  version: "SCDNA-v1",

  identity: {
    stableId: "BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK",
    contentHash: "scdna-cdragon-ui-phoneme-v1",
    sourceKind: "bug"
  },

  domain: {
    primary: "code",
    secondary: ["phoneme", "ui", "rhyme-coloring", "determinism"],
    activationBrains: [
      "CODE_BRAIN",
      "PHONEME_BRAIN",
      "UI_BRAIN",
      "RISK_BRAIN",
      "TEST_BRAIN"
    ]
  },

  retrieval: {
    lookupMode: "hybrid",
    priority: 0.95,
    confidence: 0.98,
    originalConfidence: 0.98,
    freshness: 0.9,
    canonical: true,
    minConfidence: 0.45
  },

  lifecycle: {
    status: "active",
    contradictionCount: 0,
    lastContradictionAtIndex: null,
    degradationFactor: 0.85,
    recoveryIncrement: 0.02,
    deprecationThreshold: 0.45
  },

  instruction: {
    action: "warn",
    imperative:
      "Do not let frontend fallback logic recompute vowel-family truth when backend resonance data already exists.",
    forbiddenDrift: [
      "Do not patch only the visual color palette",
      "Do not bypass backend resonance gates",
      "Do not trust frontend-only phoneme analysis over backend truth"
    ],
    requiredChecks: [
      "Verify backend resonance indices are passed to frontend",
      "Verify frontend renders confirmed indices only",
      "Run rhyme coloring regression tests"
    ]
  },

  risk: {
    riskClass: "high",
    blastRadius: "cross_system",
    staleRisk: 0.1,
    misuseRisk: 0.75
  },

  english: {
    shortMeaning:
      "Frontend rhyme coloring bug caused by weaker local vowel-family fallback.",
    expandedMeaning:
      "This pattern indicates a desync between backend phoneme authority and frontend rendering logic. The backend should remain the source of truth for vowel-family and resonance decisions. The frontend may render confirmed indices but should not independently recalculate linguistic truth.",
    operatorInstruction:
      "When this gene activates, inspect backend-to-frontend resonance data flow before changing UI color logic."
  }
};
```

---

## 12. Mathematical Model

## 12.1 Normal Retrieval Cost

Let:

```txt
N = number of memory chunks
Q = query complexity
k = retrieved candidate chunks
I = interpretation cost per chunk
S(N, Q) = semantic search cost
R(k) = read cost
```

Normal retrieval cost:

```txt
C_normal = S(N, Q) + R(k) + kI
```

The agent must search, read candidates, and interpret why those candidates matter.

---

## 12.2 Genome Retrieval Cost

Let:

```txt
G = gene detection cost
D = decode cost
L = direct lookup cost
E = English translation cost
V = validation cost
```

Genome retrieval cost:

```txt
C_genome = G + D + L + E + V
```

With indexed genes:

```txt
L ≈ O(1)
```

So improvement ratio becomes:

```txt
Improvement ≈ C_normal / C_genome
```

This means SCDNA improves retrieval most when:

```txt
N is large
k is high
interpretation cost is high
the gene is correctly matched
the decoder is stable
```

---

## 12.3 Information-Theoretic Lower Bound

If there are M distinct retrievable memories, a unique identity code requires at least:

```txt
B_identity ≥ log2(M)
```

But a usable retrieval gene needs more than identity.

```txt
B_total =
  B_identity
  + B_domain
  + B_brains
  + B_action
  + B_confidence
  + B_risk
  + B_version
  + B_error_check
```

SCDNA cannot compress below the minimum bits required to distinguish memory identity, domain, action, and risk.

This prevents magical thinking.

The gene can be compact, but it cannot be meaningfully smaller than the information it must preserve.

---

## 12.4 Routing Gain

Let:

```txt
A = total available Amplifier brains
a = activated brains
p = probability router selects correct brain set
c = cost of one unnecessary brain activation
m = cost of missing a required brain
```

Without SCDNA:

```txt
C_route_normal = A * c
```

With SCDNA:

```txt
C_route_gene = a * c + (1 - p)m
```

Routing improves when:

```txt
a << A
p is high
m is controlled by fallback search
```

SCDNA should activate fewer brains with higher precision.

---

## 12.5 Hallucination Reduction Model

Let:

```txt
H0 = baseline hallucination probability during retrieval interpretation
g = gene correctness probability
t = translation correctness probability
v = validation strength
```

A simplified hallucination bound:

```txt
H_gene ≤ H0 * (1 - gtv)
```

This is not a guarantee.

It means decoded genes can reduce hallucination only when:

```txt
the gene is correct
the decoder is correct
the English translation is stable
validation exists
```

Bad genes can make hallucinations worse by giving false authority.

---

## 13. Decoder Requirements

The decoder must be deterministic.

The same input gene must produce the same decoded output.

```ts
export type DecodedGene = {
  version: string;
  sourceKind: string;
  domain: string;
  action: string;
  activationBrains: string[];
  confidence: number;
  flags: string[];
  englishInstruction: string;
};
```

### Decoder

```ts
export function decodeRetrievalGene(gene: string): DecodedGene {
  const parts = gene.split(":");

  if (parts.length !== 8) {
    throw new Error(`Invalid SCDNA gene shape. Expected 8 parts, received ${parts.length}.`);
  }

  const [prefix, version, sourceKind, domain, action, brains, confidence, flags] = parts;

  if (prefix !== "SCDNA") {
    throw new Error("Invalid retrieval gene prefix.");
  }

  if (version !== "v1") {
    throw new Error(`Unsupported retrieval gene version: ${version}.`);
  }

  const rawConfidence = Number(confidence);

  if (
    !Number.isInteger(rawConfidence) ||
    rawConfidence < 0 ||
    rawConfidence > 100
  ) {
    throw new Error(
      `Invalid confidence value: ${confidence}. Expected integer 0-100.`
    );
  }

  const parsedConfidence = rawConfidence / 100;

  return {
    version,
    sourceKind,
    domain,
    action,
    activationBrains: brains.split("+").filter(Boolean),
    confidence: parsedConfidence,
    flags: flags.split("+").filter(Boolean),
    englishInstruction: translateGeneToEnglish({
      sourceKind,
      domain,
      action,
      activationBrains: brains.split("+").filter(Boolean),
      confidence: parsedConfidence,
      flags: flags.split("+").filter(Boolean)
    })
  };
}
```

---

## 14. English Translation Layer

The translation layer converts machine code into operator-readable instructions.

```ts
type GeneTranslationInput = {
  sourceKind: string;
  domain: string;
  action: string;
  activationBrains: string[];
  confidence: number;
  flags: string[];
};

export function translateGeneToEnglish(input: GeneTranslationInput): string {
  const flagMeanings = input.flags.map(translateFlag);

  return [
    `This is a ${input.sourceKind} gene in the ${input.domain} domain.`,
    `Primary action: ${input.action}.`,
    `Activate: ${input.activationBrains.join(", ")}.`,
    `Confidence: ${input.confidence.toFixed(2)}.`,
    ...flagMeanings
  ].join(" ");
}

function translateFlag(flag: string): string {
  switch (flag) {
    case "NO_FRONTEND_FALLBACK":
      return "Do not let frontend fallback logic recompute truth when a stronger backend source exists.";

    case "RUN_REGRESSION_TESTS":
      return "Run targeted regression tests before accepting the change.";

    case "HIGH_BLAST_RADIUS":
      return "Treat this memory as high-risk because multiple systems may consume it.";

    case "CANONICAL":
      return "Treat this memory as a canonical system rule unless fresher evidence overrides it.";

    case "STALE_CHECK":
      return "Check freshness before using this memory as an active instruction.";

    default:
      return `Unknown flag: ${flag}. Do not silently ignore this flag.`;
  }
}
```

---

## 15. Integration With Scholomance ForceField

SCDNA should not act alone.

Decoded genes must be injected into the ForceField.

```ts
export function applyDecodedGeneToForceField(
  field: VaelrixCortexForceField,
  gene: DecodedGene
): VaelrixCortexForceField {
  return {
    ...field,

    routing: {
      ...field.routing,
      activeBrains: Array.from(
        new Set([...field.routing.activeBrains, ...gene.activationBrains])
      ),
      activationReasons: {
        ...field.routing.activationReasons,
        ...Object.fromEntries(
          gene.activationBrains.map(brain => [
            brain,
            `Activated by SCDNA gene in ${gene.domain} domain`
          ])
        )
      }
    },

    context: {
      ...field.context,
      confirmedFacts: [
        ...field.context.confirmedFacts,
        gene.englishInstruction
      ]
    }
  };
}
```

---

## 16. Integration With Search Governor

Search Governor should check for a gene match before broad search.

```txt
1. Check exact SCDNA match.
2. Check symbolic gene index.
3. Check known decoded genes in ForceField.
4. If no gene resolves the unknown, allow normal retrieval.
```

### Rule

```txt
If a high-confidence gene resolves the task,
prefer gene decoding over broad semantic search.
```

### Important exception

```txt
If gene confidence is low, freshness is low, or misuse risk is high,
allow validation search before action.
```

---

## 17. Integration With TurboQuant

TurboQuant stores compressed memory chunks.

SCDNA stores the instruction header.

Together:

```txt
SCDNA = what this memory means and how to use it
TurboQuant = compressed body of the memory
```

A retrieval object should look like this:

```ts
export type TurboQuantGenomeChunk = {
  gene: RetrievalGene;
  compressedPayloadRef: string;
  summary: string;
  createdAtIndex: number;
  updatedAtIndex: number;
};
```

Avoid real-time timestamps in deterministic flows.

Use monotonic indices or stable version counters.

---

## 18. Runtime Flow

```txt
1. User sends task
2. Vaelrix Core initializes ForceField
3. SCDNA detector checks for matching retrieval genes
4. Matching genes are decoded
5. Decoded genes update ForceField
6. Relevant Amplifiers activate
7. TurboQuant retrieves compressed payloads if needed
8. Council Arbiter merges gene-derived and brain-derived findings
9. Search Governor blocks redundant search
10. Vaelrix acts with decoded memory instruction
```

---

## 19. MVP Scope

The first version should be small.

### MVP components

```txt
1. Gene string format
2. Gene decoder
3. Flag translator
4. Gene validator
5. Gene registry (3 genes only)
6. Detector with token scoring
7. Decoder / validator / detector tests
```

Do not start by encoding every memory.

Start with exactly three canonical genes:

```txt
BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK
ARCH_RULE_BACKEND_TRUTH_AUTHORITY
TOOL_RULE_SEARCH_BEFORE_ASSUME
```

This proves the system without turning the registry into a memory swamp.

---

## 20. Suggested File Layout

```txt
src/
  vaelrix/
    scdna/
      types.ts
      decodeRetrievalGene.ts
      translateGeneToEnglish.ts
      validateGene.ts
      geneRegistry.ts
      detectGeneMatches.ts

  tests/
    scdna.decodeRetrievalGene.test.ts
    scdna.translateGeneToEnglish.test.ts
    scdna.validateGene.test.ts
    scdna.detectGeneMatches.test.ts
```

Later phases add `applyGeneToForceField.ts`, `lifecycle.ts`, `compiler/`, `pixelbrain/tierParser.ts`, and their tests.

---

## 21. Initial Gene Registry

```ts
export type GeneRegistry = Record<string, RetrievalGene>;

export const geneRegistry: GeneRegistry = {
  BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK: colorDragonFallbackGene
};
```

---

## 22. Gene Match Detection

```ts
export function detectGeneMatches(
  query: string,
  registry: GeneRegistry
): RetrievalGene[] {
  const normalizedQuery = normalizeText(query);
  const queryTokens = new Set(tokenize(normalizedQuery));

  return Object.values(registry)
    .filter(gene => gene.lifecycle.status === "active")
    .map(gene => {
      const searchable = normalizeText([
        gene.identity.stableId,
        gene.domain.primary,
        ...gene.domain.secondary,
        gene.english.shortMeaning,
        gene.english.expandedMeaning,
        gene.instruction.imperative,
        ...gene.instruction.forbiddenDrift,
        ...gene.instruction.requiredChecks,
      ].join(" "));

      const geneTokens = new Set(tokenize(searchable));
      const overlap = [...queryTokens].filter(token => geneTokens.has(token)).length;
      const score = overlap / Math.max(1, queryTokens.size);

      return { gene, score };
    })
    .filter(({ gene, score }) => {
      const priorityBoost = gene.retrieval.priority * 0.15;
      const confidenceBoost = gene.retrieval.confidence * 0.15;
      return score + priorityBoost + confidenceBoost >= 0.45;
    })
    .sort((a, b) => b.score - a.score)
    .map(result => result.gene);
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter(token => token.length >= 3);
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
```

---

## 23. Validation Rules

Every gene must pass validation before use.

```ts
export function validateGene(gene: RetrievalGene): string[] {
  const errors: string[] = [];

  if (!gene.version) errors.push("Missing gene version.");
  if (!gene.identity.stableId) errors.push("Missing stable ID.");
  if (!gene.identity.contentHash) errors.push("Missing content hash.");
  if (!gene.domain.primary) errors.push("Missing primary domain.");
  if (gene.domain.activationBrains.length === 0) {
    errors.push("Gene must activate at least one brain.");
  }

  if (gene.retrieval.confidence < 0 || gene.retrieval.confidence > 1) {
    errors.push("Confidence must be between 0 and 1.");
  }

  if (gene.retrieval.freshness < 0 || gene.retrieval.freshness > 1) {
    errors.push("Freshness must be between 0 and 1.");
  }

  if (!gene.instruction.imperative) {
    errors.push("Gene must include an imperative instruction.");
  }

  if (!gene.english.shortMeaning) {
    errors.push("Gene must include short English meaning.");
  }

  return errors;
}
```

---

## 24. Acceptance Criteria

See the consolidated acceptance criteria in **Section 31: Updated Acceptance Criteria**.

---

## 25. QA Checklist

### Decoder QA

```txt
Valid compact gene decodes successfully
Invalid prefix fails
Invalid version fails
Confidence below 0 fails
Confidence above 100 fails
Non-integer confidence fails
Missing fields fail
Unknown flags are preserved and reported
Same gene always produces same output
```

### Translation QA

```txt
Known flags translate correctly
Unknown flags do not disappear
English instruction includes source, domain, action, brains, and confidence
Translation is deterministic
Translation snapshot does not drift across refactors
```

### Validation QA

```txt
Valid gene passes validation
Gene without stableId fails
Gene without contentHash fails
Gene without primary domain fails
Gene without activation brains fails
Gene without imperative fails
Gene without short meaning fails
Confidence outside [0, 1] fails
Freshness outside [0, 1] fails
```

### Detector QA

```txt
Exact stableId match wins over semantic match
Broad domain word does not activate every gene
Deprecated gene does not activate
Low-confidence gene requires validation
Score threshold rejects weak matches
Results are sorted by relevance
```

### Routing QA

```txt
Gene activates correct Amplifiers
Gene does not activate unrelated brains
Activation reasons are recorded
Suppressed brains remain silent
```

### Search QA

```txt
Exact gene match bypasses broad search
High-confidence gene reduces search calls
Low-confidence gene triggers validation
Stale gene requires freshness check
No gene match falls back to normal retrieval
```

### ForceField QA

```txt
Decoded gene updates confirmed facts
Decoded gene updates routing field
Decoded gene respects search budget
Decoded gene does not silently override contradictions
Decoded gene can be challenged by fresher evidence
Gene match count is capped per request
```

### Degradation QA

```txt
Contradiction degrades confidence deterministically from originalConfidence
Consistent correct use recovers confidence slowly
Confidence at or below threshold deprecates gene
Deprecated gene is skipped by detector
Deprecated gene remains in registry for audit
Superseded gene links to replacement
```

### Tier QA

```txt
Degradation emits correct yellow tier based on severity
Deprecation emits R1
Active contradiction blocking action emits R2
Cross-system deprecated gene emits R3
Registry integrity failure emits R4
Unknown tier is rejected by parser
```

### Compiler QA

```txt
Valid gene passes acceptance checklist
Invalid schema is rejected
Duplicate stableId is rejected or requires supersede
Unknown brain reference is rejected
New flag must be explicitly acknowledged
Gene is not committed without --commit
Compiler emits PB-OK-v1 or PB-YELLOW-v1 on acceptance
```

### Regression QA

```txt
Existing retrieval still works
Existing TurboQuant chunks still work
Existing Amplifier routing still works
Existing ForceField search governor still works
Existing final response formatting still works
Existing health signals still parse after tier upgrade
```

---

## 26. Next Risks

### Risk 1: Gene explosion

If every tiny memory becomes a gene, the registry becomes noisy and the detector becomes useless.

**Mitigation:** only promote a memory into SCDNA if it prevents a repeated mistake or activates a reusable workflow. Enforce the compiler acceptance checklist and cap the initial registry at three genes.

---

### Risk 2: False authority

A gene may look official even when it is wrong.

**Mitigation:** include confidence, freshness, canonical status, contradiction pathways, and required validation. Never let a gene override fresher evidence silently.

---

### Risk 3: Over-routing

A gene may activate too many brains, turning cognition into noise.

**Mitigation:** the compiler checklist requires fewer than five activated brains unless justified. Personality weighting in the ForceField further dampens irrelevant activations.

---

### Risk 4: Decoder drift

A gene may decode differently if the translator changes.

**Mitigation:** version every decoder, preserve compatibility tables, and snapshot-test English translations.

---

### Risk 5: Overcompression

If genes become too short, meaning becomes cryptic.

**Mitigation:** keep compact strings linked to full structured gene records. The compact string is a serialization, not the source of truth.

---

### Risk 6: Bad tagging

If a memory receives the wrong gene, it may activate the wrong brains.

**Mitigation:** add gene validation, review workflows, correction history, and degradation/deprecation on contradiction.

---

### Risk 7: Retrieval tunnel vision

If the system trusts a gene too much, it may ignore better evidence.

**Mitigation:** allow ForceField contradiction checks and freshness overrides. A gene contradicted by evidence degrades immediately.

---

### Risk 8: Detector overmatch

Broad domain words or loose matching can activate genes for unrelated queries.

**Mitigation:** use token-overlap scoring with a minimum score threshold, exclude deprecated genes, and require priority/confidence boosts to pass. Exact stableId matches win over semantic matches.

---

## 27. Implementation Phases

## Phase 1: SCDNA Decoder

### What

Implement compact gene parsing, validation, and English translation.

### Why

The system needs deterministic decoding before genes can affect routing or retrieval.

### Risk reduced

Prevents opaque codes from becoming unverified magical strings.

---

## Phase 2: Gene Registry

### What

Create a registry of known genes.

### Why

Vaelrix needs stable lookup and correction paths.

### Risk reduced

Prevents scattered hard-coded gene handling.

---

## Phase 3: ForceField Injection

### What

Decoded genes update ForceField context and routing.

### Why

Genes must affect the live cognition environment.

### Risk reduced

Prevents retrieval knowledge from remaining passive text.

---

## Phase 4: Search Governor Integration

### What

Check genes before broad search.

### Why

High-confidence genes can bypass redundant semantic retrieval.

### Risk reduced

Reduces search spam and repeated context discovery.

---

## Phase 5: TurboQuant Genome Chunks

### What

Attach SCDNA genes to compressed TurboQuant memory payloads.

### Why

The system needs both instruction headers and compressed memory bodies.

### Risk reduced

Prevents memory chunks from being retrieved without operational meaning.

---

## Phase 6: Amplifier Router Integration

### What

Genes activate Amplifier brains directly.

### Why

Retrieval should guide cognition, not just provide text.

### Risk reduced

Prevents irrelevant brain activation and improves task routing.

---

## Phase 7: Gene Lifecycle and Degradation

### What

Implement contradiction detection, confidence degradation, recovery, and deprecation.

### Why

Genes must self-correct when they become ambiguous or wrong.

### Risk reduced

Prevents stale or over-broad genes from steering Vaelrix indefinitely.

---

## Phase 8: Tiered Health Signals

### What

Upgrade PixelBrain health bytecodes to support yellow and red tiers across SCDNA and existing ForceField subsystems.

### Why

Receivers need severity levels to decide whether to log, warn, block, or halt.

### Risk reduced

Prevents all health signals from being treated equally and avoids alert fatigue.

---

## Phase 9: SCDNA Compiler

### What

Build a manual, review-driven compiler CLI for authoring, validating, and committing genes to the registry.

### Why

Genes must be curated, not generated. The compiler enforces structure without removing human judgment.

### Risk reduced

Prevents gene explosion, false authority, and unreviewed operational rules.

---

## 28. Gene Lifecycle and Self-Destruction

Genes are not immortal. They degrade when they contradict evidence, other genes, or the task at hand, and they recover when they consistently apply cleanly.

## 28.1 Degradation Rules

When a contradiction is detected at runtime index `i`:

```txt
contradictionCount += 1
lastContradictionAtIndex = i
confidence = max(minConfidence, originalConfidence * (degradationFactor ** contradictionCount))
```

The degradation is always computed from `originalConfidence`, not the current degraded value, so the curve matches the table exactly and a gene cannot accidentally double-punish itself.

Default constants:

```txt
degradationFactor    = 0.85
recoveryIncrement    = 0.02
deprecationThreshold = 0.45
```

Example confidence curve starting at 0.98:

| Contradictions | Confidence | Status |
|---|---|---|
| 0 | 0.980 | active |
| 1 | 0.833 | degraded |
| 2 | 0.708 | degraded |
| 3 | 0.602 | degraded |
| 4 | 0.512 | degraded |
| 5 | 0.435 | deprecated |

## 28.2 What Counts as a Contradiction

A contradiction event fires when:

```txt
1. Two matched genes have conflicting imperatives for the same query.
2. The gene's action conflicts with the task classification.
3. The gene activates a brain that the ForceField has suppressed.
4. The gene's decoded instruction is overridden by fresher evidence and the override proves correct.
5. The gene matches two distinctly different tasks at the same time.
```

The fifth rule is critical: if one gene tells Vaelrix to do two different things simultaneously, it degrades immediately.

## 28.3 Recovery

When a gene activates without contradiction:

```txt
contradictionCount = max(0, contradictionCount - 0.5)
confidence = min(originalConfidence, confidence + recoveryIncrement)
```

This prevents a single mistake from permanently killing a useful gene while ensuring chronic contradictions eventually deprecate it.

## 28.4 Deprecation and Audit

When `confidence <= deprecationThreshold`:

```txt
status = "deprecated"
emit PB-RED-v1:SCDNA:GENE_DEPRECATED:<stableId>:R1:confidence=<value>:count=<count>
```

Deprecated genes remain in the registry for audit but are skipped by the detector. They may be superseded by a new gene via the `supersededBy` field.

---

## 29. Tiered Health Signals

SCDNA emits tiered PixelBrain health signals so that receivers can decide how severely to react without parsing prose.

## 29.1 Yellow Tiers — Warning / Attention

| Tier | Meaning | Example |
|---|---|---|
| `Y1` | Informational drift | confidence dropped slightly |
| `Y2` | Repeated pattern | same contradiction twice |
| `Y3` | Near deprecation threshold | confidence close to 0.45 |
| `Y4` | Validation required | gene matched but evidence stale |

## 29.2 Red Tiers — Failure / Block

| Tier | Meaning | Example |
|---|---|---|
| `R1` | Soft failure / manual review | gene deprecated, fallback available |
| `R2` | Hard failure / block action | active gene contradiction blocks routing |
| `R3` | Critical / cross-system risk | deprecated gene had high blast radius |
| `R4` | Emergency / stop all | registry integrity compromised |

## 29.3 Signal Format

```txt
PB-YELLOW-v1:SCDNA:<component>:<stableId>:<tier>:<key>=<value>...
PB-RED-v1:SCDNA:<component>:<stableId>:<tier>:<key>=<value>...
```

Examples:

```txt
PB-YELLOW-v1:SCDNA:GENE_DEGRADED:BUGPATTERN_COLOR_DRAGON:Y1:confidence=0.83:count=1
PB-YELLOW-v1:SCDNA:GENE_DEGRADED:BUGPATTERN_COLOR_DRAGON:Y3:confidence=0.45:count=3
PB-RED-v1:SCDNA:GENE_DEPRECATED:BUGPATTERN_COLOR_DRAGON:R1:confidence=0.43:count=5
PB-RED-v1:SCDNA:GENE_CONTRADICTION:BUGPATTERN_COLOR_DRAGON:R2:conflict_with=ARCH_RULE_BACKEND_TRUTH
PB-RED-v1:SCDNA:REGISTRY_INTEGRITY:R4:invalid_gene_count=3
```

## 29.4 Tier Action Contract

| Tier | Action implied |
|---|---|
| `Y1` | Log, no routing change |
| `Y2` | Surface to synthesis, continue |
| `Y3` | Require validation before acting |
| `Y4` | Pause and request fresh evidence |
| `R1` | Deprecate/quarantine, fallback |
| `R2` | Block the current action |
| `R3` | Halt related subsystem |
| `R4` | Stop session, require human |

The same tier model applies retroactively to existing ForceField health signals from the determinism auditor, tool governor, and search governor.

---

## 30. Compiler Ritual

The SCDNA compiler is a development-time tool, not a runtime agent. It helps authors create valid genes and enforces curation policy.

## 30.1 Compiler Responsibilities

```txt
1. Validate schema and constraints.
2. Generate stableId and contentHash.
3. Produce compact SCDNA:v1:... string.
4. Detect duplicate or near-duplicate genes.
5. Verify that activationBrains exist in the Amplifier registry.
6. Check that flags are known or explicitly marked as new.
7. Enforce the gene acceptance checklist.
8. Emit a health signal when a gene is accepted, deprecated, or superseded.
```

## 30.2 Acceptance Checklist

Before a gene is added, the compiler requires confirmation of:

```txt
- [ ] This pattern recurs.
- [ ] The instruction is falsifiable.
- [ ] The gene activates the minimum necessary brains (fewer than 5 unless justified).
- [ ] The English translation is unambiguous.
- [ ] Confidence and freshness are justified by evidence.
- [ ] No existing gene already covers this case.
- [ ] The author accepts responsibility for future maintenance.
```

## 30.3 Command Example

```bash
python -m vaelrix_forcefield.scdna.compiler add \
  --id BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK \
  --source bug \
  --domain code \
  --secondary phoneme,ui \
  --brains CODE,PHONEME,UI,RISK,TEST \
  --action warn \
  --confidence 98 \
  --flags NO_FRONTEND_FALLBACK,RUN_REGRESSION_TESTS
```

The compiler outputs the validated Python registry entry and the compact string. It does not modify the registry without explicit `--commit`.

---

## 31. Updated Acceptance Criteria

SCDNA is successful when:

```txt
Genes decode deterministically.
Compact gene confidence is bounded to integers 0-100.
Genes translate into stable English.
High-confidence genes activate relevant brains.
Unknown flags are surfaced, not ignored.
The detector does not activate genes on broad domain words alone.
Deprecated genes never activate.
Search Governor checks gene matches before broad search.
ForceField receives decoded instructions.
TurboQuant payloads can be retrieved from gene references.
Genes reduce repeated retrieval.
Genes reduce interpretation ambiguity.
Low-confidence or stale genes require validation.
Genes are manually curated, not auto-generated.
Conflicting genes degrade and eventually deprecate.
Deprecated genes remain auditable.
Tiered health signals are emitted for every degradation and deprecation event.
```

---

## 32. Final Principle

SCDNA obeys one central law:

```txt
Do not merely retrieve memory.
Express memory.
```

Vaelrix should not only remember that something exists.

He should know:

```txt
What it is
Why it matters
Which organ needs it
What action it implies
What risk it carries
How to explain it in English
```

The Retrieval Genome Protocol upgrades memory from passive storage into encoded operational inheritance.

With Amplifier Cortex, Scholomance ForceField, and SCDNA together, Vaelrix becomes less like a model searching a library and more like an organism reading its own genetic instructions.
