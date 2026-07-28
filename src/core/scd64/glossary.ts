import crypto from 'node:crypto';
import type { SCD64RemediationHint } from './types';
import { SCD64_SLOT_NAMES, ART_SLOT_ALIASES } from './constants';

export { SCD64_SLOT_NAMES, ART_SLOT_ALIASES };

export const BUG_FAMILIES = Object.freeze({
  COLOR_DRAGON: Object.freeze({
    versionByte: '01',
    predictedVersionByte: 'E1',
    domain: 'COLOR',
    description: 'Color bug caused by coordinate drift concealed by a fallback color path.',
    canonicals: Object.freeze([
      { slot: 'BUGCLASS',  canonical: 'BUGCLASS:COLOR_DRAGON:coordinate-drift+fallback-masking' },
      { slot: 'COORDSYS',  canonical: 'COORDSYS:source-charstart+lexical-sibling-walk+frontend-token-boundary' },
      { slot: 'INVARIANT', canonical: 'INVARIANT:globalCharStart-mismatch+vowelFamily-source-divergence' },
      { slot: 'MAGNITUDE', canonical: 'MAGNITUDE:mismatchRate>=0.94+perLineDrift+tokenCoverageDelta' },
      { slot: 'MASKING',   canonical: 'MASKING:resonantCharStarts-true+frontend-fallback-painter-overrides-family' },
      { slot: 'GATE',      canonical: 'GATE:resonanceGate>=0.95+backend-authoritative+frontend-recomputes-color' },
      { slot: 'PROPAGATE', canonical: 'PROPAGATE:backend-IR-to-ReadPage-to-Lexical-TruesightPlugin-divergence' },
      { slot: 'VERDICT',   canonical: 'VERDICT:diagnose-only+authoritative-backend-family+rogue-painter' },
    ]),
  }),
  RESONANCE_GHOST: Object.freeze({
    versionByte: '02',
    predictedVersionByte: 'E2',
    domain: 'COLOR',
    description: 'Resonance gate Set construction failure: gate Set is empty when it should be populated, so the resonance-coloring never fires.',
    canonicals: Object.freeze([
      { slot: 'BUGCLASS',  canonical: 'BUGCLASS:RESONANCE_GHOST:gate-Set-construction-failure' },
      { slot: 'COORDSYS',  canonical: 'COORDSYS:gate-Set-from-allConnections+frontend-receives-empty-Set' },
      { slot: 'INVARIANT', canonical: 'INVARIANT:resonantCharStarts-Set-size-mismatch-with-IR-connections' },
      { slot: 'MAGNITUDE', canonical: 'MAGNITUDE:emptySetRate>=0.80+zeroColoredWords+gateSetSize=0' },
      { slot: 'MASKING',   canonical: 'MASKING:gate-Set-quiet-empty+frontend-defaults-to-everything-or-nothing' },
      { slot: 'GATE',      canonical: 'GATE:resonanceGate>=0.95+Set-construction-bug+frontend-shows-grey' },
      { slot: 'PROPAGATE', canonical: 'PROPAGATE:deepRhymeEngine-to-syntaxLayer-Set-construction-divergence' },
      { slot: 'VERDICT',   canonical: 'VERDICT:diagnose-only+gate-Set-construction-broken+frontend-shows-nothing' },
    ]),
  }),
  GATE_DATA_ABSENT: Object.freeze({
    versionByte: '03',
    predictedVersionByte: 'E3',
    domain: 'COLOR',
    description: 'Resonance gate starved of input: rhyme connections exist only on the server synthesis path; the fallback path omits allConnections, so the gate reads a server-only key and the Set is empty.',
    canonicals: Object.freeze([
      { slot: 'BUGCLASS',  canonical: 'BUGCLASS:GATE_DATA_ABSENT:fallback-synthesis-omits-connections+gate-reads-server-only-key' },
      { slot: 'COORDSYS',  canonical: 'COORDSYS:server-only-syntaxLayer.allConnections+fallback-buildSyntaxLayer-emits-no-connections' },
      { slot: 'INVARIANT', canonical: 'INVARIANT:gate-connection-source-must-exist-on-every-synthesis-path' },
      { slot: 'MAGNITUDE', canonical: 'MAGNITUDE:fallbackPathSelected=1.0+gateSetSize=0+zeroColoredWords-when-server-unreachable' },
      { slot: 'MASKING',   canonical: 'MASKING:isEnabled-false-silent-backoff-fallthrough+activeConnections-has-verseIR-fallback-resonanceGate-does-not' },
      { slot: 'GATE',      canonical: 'GATE:resonanceGate-always-consulted+input-allConnections-undefined-on-fallback-path' },
      { slot: 'PROPAGATE', canonical: 'PROPAGATE:server-unreachable-to-isEnabled-false-to-synthesizeVerse-to-empty-syntaxLayer-to-empty-gate-Set' },
      { slot: 'VERDICT',   canonical: 'VERDICT:diagnose-only+wire-connections-into-fallback-synthesis-or-add-gate-degraded-mode' },
    ]),
  }),
  GATE_DRIFT_FALSE_ALARM: Object.freeze({
    versionByte: '04',
    predictedVersionByte: 'E4',
    domain: 'COLOR',
    description: 'Drift detector false-positive: warning logic checked if the current word was present in the subset of actively resonating words rather than the full document analysis.',
    canonicals: Object.freeze([
      { slot: 'BUGCLASS',  canonical: 'BUGCLASS:GATE_DRIFT_FALSE_ALARM:probe-checked-subset-instead-of-full-analysis' },
      { slot: 'COORDSYS',  canonical: 'COORDSYS:truesight-plugin-maybeWarnIfGateConventionDrifted' },
      { slot: 'INVARIANT', canonical: 'INVARIANT:analyzedWordsByCharStart-must-be-used-to-check-drift-not-resonantCharStarts' },
      { slot: 'MAGNITUDE', canonical: 'MAGNITUDE:warning-on-first-non-rhyming-word' },
      { slot: 'MASKING',   canonical: 'MASKING:no-masking-pure-diagnostic-error' },
      { slot: 'GATE',      canonical: 'GATE:probe-always-warns-when-globalCharStart-missing-from-resonantCharStarts' },
      { slot: 'PROPAGATE', canonical: 'PROPAGATE:LexicalScrollEditor-to-TruesightPlugin-to-console-warn' },
      { slot: 'VERDICT',   canonical: 'VERDICT:diagnose-only+change-probe-to-check-full-analysis-map' },
    ]),
  }),
  SCORE_DRIFT: Object.freeze({
    versionByte: '05',
    predictedVersionByte: 'E5',
    domain: 'SCORING',
    description: 'Ranker score diverges from the transparent reference token weight: a provider miscalibrates a token (over- or under-weighted) and the error stays hidden until the final ranked list.',
    canonicals: Object.freeze([
      { slot: 'BUGCLASS',  canonical: 'BUGCLASS:SCORE_DRIFT:ranker-score-diverges-from-reference-token-weight' },
      { slot: 'COORDSYS',  canonical: 'COORDSYS:reference-weight-tfidf-syllable-position-vs-ranker-aggregate-of-8-providers' },
      { slot: 'INVARIANT', canonical: 'INVARIANT:abs-rankerScore-minus-referenceWeight-within-deviationThreshold-for-auditable-tokens' },
      { slot: 'MAGNITUDE', canonical: 'MAGNITUDE:abs-deviation>0.25+meanAbsoluteDeviation+worstTokenDelta' },
      { slot: 'MASKING',   canonical: 'MASKING:provider-level-weights-conceal-per-token-miscalibration-until-final-list' },
      { slot: 'GATE',      canonical: 'GATE:referenceWeight>=MIN_AUDITABLE_WEIGHT-0.05+token-was-ranked' },
      { slot: 'PROPAGATE', canonical: 'PROPAGATE:provider-scoring-to-ranker-DEFAULT_WEIGHTS-to-ranked-list-to-output' },
      { slot: 'VERDICT',   canonical: 'VERDICT:diagnose-only+over-or-under-weighted+inspect-provider-vs-DEFAULT_WEIGHTS' },
    ]),
  }),
  GHOST_LOGIC: Object.freeze({
    versionByte: '06',
    predictedVersionByte: 'E6',
    domain: 'META',
    description: 'Two syntactically valid, near-identical code constructs where only one carries correct semantics. The compiler and type-checker are silent; the human eye reads past the difference.',
    canonicals: Object.freeze([
      { slot: 'BUGCLASS',  canonical: 'BUGCLASS:GHOST_LOGIC:syntactic-similarity-conceals-semantic-divergence' },
      { slot: 'COORDSYS',  canonical: 'COORDSYS:identifier-namespace+scope-chain+lookalike-variable-pair' },
      { slot: 'INVARIANT', canonical: 'INVARIANT:two-syntactically-valid-constructs-must-not-be-confused-when-only-one-carries-correct-semantics' },
      { slot: 'MAGNITUDE', canonical: 'MAGNITUDE:confusionRate>=0.85+typechecker-silent+eye-passes-review' },
      { slot: 'MASKING',   canonical: 'MASKING:syntactic-validity-of-both-forms+similar-identifier-length-and-prefix' },
      { slot: 'GATE',      canonical: 'GATE:code-review-gate-silent+type-checker-gate-silent+linter-gate-silent' },
      { slot: 'PROPAGATE', canonical: 'PROPAGATE:developer-keystroke-to-wrong-identifier-to-silent-logic-drift-to-wrong-output' },
      { slot: 'VERDICT',   canonical: 'VERDICT:diagnose-only+semantic-diff-required+surface-similarity-is-the-mask' },
    ]),
  }),
});

// ─── ART Domain Families (PDR Phase 3) ──────────────────────────────────────
// Art-direction checksum families. Same eight-slot wire contract as bug families
// but with art-domain interpretation via ART_SLOT_ALIASES.

export const ART_FAMILIES = Object.freeze({
  ART_GENE_CURATION: Object.freeze({
    versionByte: 'A1',
    predictedVersionByte: 'F1',
    domain: 'ART',
    description: 'Art-direction gene curated, projected, and committed through the ontological pipeline.',
    canonicals: Object.freeze([
      { slot: 'BUGCLASS',  canonical: 'ART_CLASS:ART_GENE_CURATION:human-curated-aesthetic-intent' },
      { slot: 'COORDSYS',  canonical: 'CANVAS_SYS:asset-canvas+gene-coordinates+projection-context' },
      { slot: 'INVARIANT', canonical: 'DOCTRINE:gene-checksum+projection-checksum+preview-checksum-bound' },
      { slot: 'MAGNITUDE', canonical: 'VALUE_RAMP:cell-count+conflict-count+palette-role-coverage' },
      { slot: 'MASKING',   canonical: 'OCCLUSION:priority-then-geneId-overlap-policy' },
      { slot: 'GATE',      canonical: 'APPROVAL_GATE:interactive-human-gate+authority-validated' },
      { slot: 'PROPAGATE', canonical: 'PROJECTION_PATH:gene-to-SCDL-cells-to-SCD64-address-to-ledger' },
      { slot: 'VERDICT',   canonical: 'CURATOR_VERDICT:approved+committed+durable-memory-persisted' },
    ]),
  }),
  ART_PROJECTION_DRIFT: Object.freeze({
    versionByte: 'A2',
    predictedVersionByte: 'F2',
    domain: 'ART',
    description: 'Projection identity changed without re-approval: epoch bump, SDF change, or palette mapping version change.',
    canonicals: Object.freeze([
      { slot: 'BUGCLASS',  canonical: 'ART_CLASS:ART_PROJECTION_DRIFT:projection-identity-changed-without-reapproval' },
      { slot: 'COORDSYS',  canonical: 'CANVAS_SYS:projection-context-version-fields' },
      { slot: 'INVARIANT', canonical: 'DOCTRINE:projection-checksum-must-match-approval-record' },
      { slot: 'MAGNITUDE', canonical: 'VALUE_RAMP:epoch-delta+sdf-checksum-delta+palette-version-delta' },
      { slot: 'MASKING',   canonical: 'OCCLUSION:stale-approval-accepted-silently' },
      { slot: 'GATE',      canonical: 'APPROVAL_GATE:commit-refuses-on-checksum-mismatch' },
      { slot: 'PROPAGATE', canonical: 'PROJECTION_PATH:epoch-bump-to-checksum-mismatch-to-commit-refusal' },
      { slot: 'VERDICT',   canonical: 'CURATOR_VERDICT:re-preview-and-re-approve-required' },
    ]),
  }),
  ART_FEEL_WARNING: Object.freeze({
    versionByte: 'A3',
    predictedVersionByte: 'F3',
    domain: 'ART',
    description: 'Feel evaluation below threshold: structural warning only, no cell mutation.',
    canonicals: Object.freeze([
      { slot: 'BUGCLASS',  canonical: 'ART_CLASS:ART_FEEL_WARNING:spatial-awareness-below-threshold' },
      { slot: 'COORDSYS',  canonical: 'CANVAS_SYS:evaluateFeel-projection-cells' },
      { slot: 'INVARIANT', canonical: 'DOCTRINE:feel-score-is-warn-only+never-mutates-cells' },
      { slot: 'MAGNITUDE', canonical: 'VALUE_RAMP:spatialAwareness-score-vs-threshold' },
      { slot: 'MASKING',   canonical: 'OCCLUSION:none+pure-diagnostic-warning' },
      { slot: 'GATE',      canonical: 'APPROVAL_GATE:human-aesthetic-approval-required-separately' },
      { slot: 'PROPAGATE', canonical: 'PROJECTION_PATH:projection-to-feel-eval-to-warning-event-to-ledger' },
      { slot: 'VERDICT',   canonical: 'CURATOR_VERDICT:warn-only+no-action+REQUIRES_HUMAN' },
    ]),
  }),
});

const SLOT_HUMAN_MEANINGS: Record<string, Record<string, string>> = Object.freeze({
  COLOR_DRAGON: Object.freeze({
    BUGCLASS:  'Color bug caused by coordinate drift concealed by a fallback color path.',
    COORDSYS:  'Backend source charStart vs Lexical sibling walk + frontend token boundary.',
    INVARIANT: 'Global charStart matched but vowel/family source for color diverged.',
    MAGNITUDE: 'High mismatch rate (>=0.94) with per-line drift and token coverage loss.',
    MASKING:   'Resonant set present but frontend fallback painter overrode authoritative family.',
    GATE:      'Resonance gate passed (>=0.95) in backend; frontend recomputed color family anyway.',
    PROPAGATE: 'Divergence propagated: deepRhymeEngine → IR → ReadPage → TruesightPlugin.',
    VERDICT:   'Diagnose-only. Authoritative backend family identified. Rogue frontend painter.',
  }),
  RESONANCE_GHOST: Object.freeze({
    BUGCLASS:  'Resonance-gate Set construction failure: the gate Set is empty when it should be populated.',
    COORDSYS:  'Backend allConnections vs frontend gate Set; coordinate of failure is the Set-construction loop.',
    INVARIANT: '|resonantCharStarts| must equal |allConnections with score >= threshold|; mismatch means gate is silent.',
    MAGNITUDE: 'Empty gate Set rate >= 0.80; zero colored words across the document.',
    MASKING:   'Gate Set quietly empty; frontend silently falls through to either color-everything or color-nothing.',
    GATE:      'Resonance gate score >= 0.95 in backend, but gate Set is empty so no word is selected.',
    PROPAGATE: 'Divergence: deepRhymeEngine → syntaxLayer → ReadPage → gate Set construction skipped.',
    VERDICT:   'Diagnose-only. Gate Set construction broken. Frontend shows nothing.',
  }),
  GATE_DATA_ABSENT: Object.freeze({
    BUGCLASS:  'Gate starved of input: the fallback synthesis path omits rhyme connections and the gate reads a server-only key.',
    COORDSYS:  'allConnections exists only on the server path (syntaxLayer = analysis); buildSyntaxLayer emits no connections; compileVerseToIR emits no .connections.',
    INVARIANT: 'The gate’s connection source must exist on EVERY synthesis path (server and local fallback), not just the server path.',
    MAGNITUDE: 'When the server is unreachable the fallback path is always selected; gate Set size is 0 and zero words color.',
    MASKING:   'isEnabled() returns false during backoff and the fallthrough is silent; activeConnections survives via a verseIR fallback, but the resonance gate has no such fallback.',
    GATE:      'The resonance gate is always consulted, but its input (allConnections) is undefined on the fallback path, so it selects nothing.',
    PROPAGATE: 'server-unreachable → isEnabled()=false → synthesizeVerse → empty syntaxLayer → empty gate Set → no color.',
    VERDICT:   'Diagnose-only. Fix: wire connections into the fallback synthesis OR give the gate a defined degraded mode when no source exists.',
  }),
  GATE_DRIFT_FALSE_ALARM: Object.freeze({
    BUGCLASS:  'False-positive drift warning caused by checking a filtered subset of words instead of the full document.',
    COORDSYS:  'TruesightPlugin drift detector probe (maybeWarnIfGateConventionDrifted).',
    INVARIANT: 'The drift detector must check analyzedWordsByCharStart, not resonantCharStarts, to see if the word was analyzed.',
    MAGNITUDE: 'Spams console with warning on the first non-rhyming word transformed.',
    MASKING:   'No masking. The bug is purely in the diagnostic probe itself.',
    GATE:      'The probe warned if globalCharStart wasn\'t in resonantCharStarts, which is usually true for most words.',
    PROPAGATE: 'Lexical transform → TruesightPlugin drift probe → console.warn spam.',
    VERDICT:   'Diagnose-only. Fixed by updating the probe to check the full analysis map.',
  }),
  SCORE_DRIFT: Object.freeze({
    BUGCLASS:  'Ranker score diverges from the reference token weight (over- or under-weighted).',
    COORDSYS:  'Reference weight (TF-IDF × syllable salience × position) vs the ranker aggregate of 8 providers.',
    INVARIANT: '|rankerScore − referenceWeight| must stay within the deviation threshold for auditable tokens.',
    MAGNITUDE: '|deviation| exceeds the threshold (default 0.25); mean absolute deviation and worst-token delta quantify it.',
    MASKING:   'Provider-level weights conceal per-token miscalibration until the final ranked list.',
    GATE:      'Token is auditable (referenceWeight ≥ MIN_AUDITABLE_WEIGHT 0.05) and was actually ranked.',
    PROPAGATE: 'Divergence propagates: provider scoring → ranker DEFAULT_WEIGHTS → ranked list → output.',
    VERDICT:   'Diagnose-only. Over- or under-weighted; inspect the provider vs ranker DEFAULT_WEIGHTS.',
  }),
  GHOST_LOGIC: Object.freeze({
    BUGCLASS:  'Syntactic similarity conceals semantic divergence: two near-identical constructs, only one is correct.',
    COORDSYS:  'Identifier namespace + scope chain: the pair of lookalike variable or property names that are confused.',
    INVARIANT: 'The developer intended construct A but typed construct B; both are syntactically valid but only A carries correct semantics.',
    MAGNITUDE: 'Confusion rate is high (>=0.85); type-checker and linter are silent; code review passes.',
    MASKING:   'Both forms are syntactically valid with similar identifier length, prefix, and structure — invisible to automation.',
    GATE:      'Code review gate is silent. Type-checker gate is silent. Linter gate is silent. Only semantic diff catches it.',
    PROPAGATE: 'Developer keystroke → wrong identifier → silent logic drift → wrong output, with no error thrown.',
    VERDICT:   'Diagnose-only. Semantic diff required. Surface similarity IS the mask — there is no bug without the resemblance.',
  }),
  // ─── ART domain human meanings ──────────────────────────────────────────
  ART_GENE_CURATION: Object.freeze({
    BUGCLASS:  'Art-direction gene: human-curated aesthetic intent encoded as a checksummed SCDNA packet.',
    COORDSYS:  'Asset canvas dimensions + gene coordinates + projection context (SDF, palette, versions).',
    INVARIANT: 'Gene checksum + projection checksum + preview document checksum are all bound in the approval record.',
    MAGNITUDE: 'Cell count, conflict count, and palette-role coverage quantify the projection scope.',
    MASKING:   'Overlap resolved by priority-then-geneId policy; later canonical entry wins.',
    GATE:      'Interactive human gate validates authority before commit; agent-asserted strings are refused.',
    PROPAGATE: 'Gene → SCDL cells → SCD64 address → durable ledger → capability retrieval.',
    VERDICT:   'Approved, committed, and persisted to durable memory.',
  }),
  ART_PROJECTION_DRIFT: Object.freeze({
    BUGCLASS:  'Projection identity changed without re-approval (epoch bump, SDF change, palette version change).',
    COORDSYS:  'Projection context version fields: projectionAlgoVersion, conflictPolicyVersion, paletteRoleMappingVersion.',
    INVARIANT: 'Projection checksum must match the approval record; mismatch means the approval is stale.',
    MAGNITUDE: 'Epoch delta, SDF checksum delta, and palette version delta quantify the drift.',
    MASKING:   'Stale approval accepted silently if checksum binding is not enforced.',
    GATE:      'Commit refuses on checksum mismatch between projection and approval record.',
    PROPAGATE: 'Epoch bump → checksum mismatch → commit refusal → re-preview required.',
    VERDICT:   'Re-preview and re-approve required before commit.',
  }),
  ART_FEEL_WARNING: Object.freeze({
    BUGCLASS:  'Feel evaluation below threshold: structural warning only, no cell mutation.',
    COORDSYS:  'evaluateFeel invoked on projection cells for the given asset.',
    INVARIANT: 'Feel score is warn-only; it never mutates cells or blocks projection.',
    MAGNITUDE: 'spatialAwareness score vs configured threshold.',
    MASKING:   'No masking; pure diagnostic warning.',
    GATE:      'Human aesthetic approval is required separately from the Feel score.',
    PROPAGATE: 'Projection → Feel evaluation → warning event → durable ledger.',
    VERDICT:   'Warn-only. No action. REQUIRES_HUMAN for aesthetic judgment.',
  }),
});

function _humanMeaningForSlot(familyName: string, slotName: string): string {
  const familyMeanings = SLOT_HUMAN_MEANINGS[familyName];
  if (familyMeanings && familyMeanings[slotName]) return familyMeanings[slotName];
  // @ts-expect-error - indexing object with string
  return BUG_FAMILIES[familyName]?.description || 'See glossary.';
}

export function buildSCD64Glossary() {
  const out = [];

  // Bug families (existing)
  for (const [familyName, family] of Object.entries(BUG_FAMILIES)) {
    const deriveHex = (canonical: string, isBugClass: boolean, usePredictedPrefix = false) => {
      const hash = crypto.createHash('sha256').update(canonical).digest('hex').toUpperCase();
      if (isBugClass) {
        return (usePredictedPrefix ? family.predictedVersionByte : family.versionByte) + hash.slice(0, 6);
      }
      return hash.slice(0, 8);
    };

    for (let i = 0; i < family.canonicals.length; i += 1) {
      const entry = family.canonicals[i];
      const isBug = entry.slot === 'BUGCLASS';
      const hex = deriveHex(entry.canonical, isBug);
      
      const glossaryEntry = {
        schema: 'SCD64_GLOSSARY_ENTRY',
        schemaVersion: 1,
        family: familyName,
        slotIndex: isBug ? 0 : i,
        slotName: entry.slot,
        hexCode: hex,
        versionByte: isBug ? family.versionByte : undefined,
        predictedVersionByte: isBug ? family.predictedVersionByte : undefined,
        category: familyName,
        canonicalMeaning: entry.canonical.split(':').slice(1).join(':'),
        canonicalDerivationString: entry.canonical,
        humanMeaning: _humanMeaningForSlot(familyName, entry.slot),
        jsonFormulaTemplate: { name: entry.slot.toLowerCase() },
        fixedForever: true,
        categoryChecksum: ""
      };
      glossaryEntry.categoryChecksum = crypto.createHash('sha256')
        .update(JSON.stringify({
          family: familyName,
          slotName: entry.slot,
          hexCode: hex,
          canonical: entry.canonical,
        }))
        .digest('hex')
        .slice(0, 16)
        .toUpperCase();
      out.push(Object.freeze(glossaryEntry));
    }
  }

  // ART families (PDR Phase 3) — same wire contract, art-domain interpretation
  for (const [familyName, family] of Object.entries(ART_FAMILIES)) {
    const deriveHex = (canonical: string, isArtClass: boolean) => {
      const hash = crypto.createHash('sha256').update(canonical).digest('hex').toUpperCase();
      if (isArtClass) {
        return family.versionByte + hash.slice(0, 6);
      }
      return hash.slice(0, 8);
    };

    for (let i = 0; i < family.canonicals.length; i += 1) {
      const entry = family.canonicals[i];
      const isArtClass = entry.slot === 'BUGCLASS'; // ART_CLASS maps to BUGCLASS slot
      const hex = deriveHex(entry.canonical, isArtClass);
      const artAlias = ART_SLOT_ALIASES[entry.slot as keyof typeof ART_SLOT_ALIASES] ?? entry.slot;

      const glossaryEntry = {
        schema: 'SCD64_GLOSSARY_ENTRY',
        schemaVersion: 1,
        family: familyName,
        domain: 'ART' as const,
        slotIndex: isArtClass ? 0 : i,
        slotName: entry.slot,
        artSlotAlias: artAlias,
        hexCode: hex,
        versionByte: isArtClass ? family.versionByte : undefined,
        predictedVersionByte: isArtClass ? family.predictedVersionByte : undefined,
        category: familyName,
        canonicalMeaning: entry.canonical.split(':').slice(1).join(':'),
        canonicalDerivationString: entry.canonical,
        humanMeaning: _humanMeaningForSlot(familyName, entry.slot),
        jsonFormulaTemplate: { name: artAlias.toLowerCase() },
        fixedForever: true,
        categoryChecksum: ""
      };
      glossaryEntry.categoryChecksum = crypto.createHash('sha256')
        .update(JSON.stringify({
          family: familyName,
          slotName: entry.slot,
          hexCode: hex,
          canonical: entry.canonical,
        }))
        .digest('hex')
        .slice(0, 16)
        .toUpperCase();
      out.push(Object.freeze(glossaryEntry));
    }
  }

  return Object.freeze(out);
}

export const SCD64_GLOSSARY = buildSCD64Glossary();
