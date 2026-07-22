/**
 * PHENOTYPIC-IDEAL-v1 — derived per-query packet (not curated archaeology).
 * Validation + assembly helpers for npm compose and tests.
 */

export const CONTRACT = 'PHENOTYPIC-IDEAL-v1';
export const VERSION = '1.0.0';

export const CLASSIFICATIONS = Object.freeze([
  'cosmetic',
  'structural',
  'behavioral',
  'architectural',
]);

export const BRIDGES = Object.freeze([
  'adapter',
  'registry',
  'schema',
  'shared_util',
  'sync_layer',
]);

/**
 * @param {unknown} packet
 * @returns {string[]} human-readable errors (empty = valid)
 */
export function validatePhenotypicIdealPacket(packet) {
  const errors = [];
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
    return ['packet is not an object'];
  }

  if (packet.contract !== CONTRACT) {
    errors.push(`contract must be ${JSON.stringify(CONTRACT)}`);
  }
  if (typeof packet.version !== 'string' || !packet.version) {
    errors.push('version must be a non-empty string');
  }
  if (typeof packet.query !== 'string') {
    errors.push('query must be a string');
  }
  if (packet.scope !== 'repo' && packet.scope !== 'divtube') {
    errors.push('scope must be "repo" or "divtube"');
  }
  if (typeof packet.assembledAt !== 'string' || !packet.assembledAt) {
    errors.push('assembledAt must be a non-empty string');
  }

  const search = packet.search;
  if (!search || typeof search !== 'object') {
    errors.push('search is required');
  } else {
    if (typeof search.engine !== 'string' || !search.engine) {
      errors.push('search.engine must be a non-empty string');
    }
    if (!Array.isArray(search.hits)) {
      errors.push('search.hits must be an array');
    } else {
      search.hits.forEach((hit, i) => {
        if (!hit || typeof hit !== 'object') {
          errors.push(`search.hits[${i}] is not an object`);
          return;
        }
        if (typeof hit.path !== 'string' || !hit.path) {
          errors.push(`search.hits[${i}].path is required`);
        }
      });
    }
  }

  const evidence = packet.evidence;
  if (!evidence || typeof evidence !== 'object') {
    errors.push('evidence is required');
  } else {
    if (!Array.isArray(evidence.capabilities)) {
      errors.push('evidence.capabilities must be an array');
    }
    if (!Array.isArray(evidence.genes)) {
      errors.push('evidence.genes must be an array');
    }
  }

  const phenotype = packet.phenotype;
  if (!phenotype || typeof phenotype !== 'object') {
    errors.push('phenotype is required');
  } else {
    for (const key of ['ideal', 'observed', 'gap']) {
      if (phenotype[key] == null) {
        errors.push(`phenotype.${key} is required`);
      }
    }
  }

  if (!Array.isArray(packet.boonSeeds)) {
    errors.push('boonSeeds must be an array');
  } else {
    const hitCount = Array.isArray(search?.hits) ? search.hits.length : 0;
    const capCount = Array.isArray(evidence?.capabilities)
      ? evidence.capabilities.length
      : 0;

    packet.boonSeeds.forEach((seed, i) => {
      const p = `boonSeeds[${i}]`;
      if (!seed || typeof seed !== 'object') {
        errors.push(`${p} is not an object`);
        return;
      }
      if (typeof seed.titleHint !== 'string' || !seed.titleHint.trim()) {
        errors.push(`${p}.titleHint is required`);
      }
      if (!CLASSIFICATIONS.includes(seed.classification)) {
        errors.push(`${p}.classification must be one of ${CLASSIFICATIONS.join('|')}`);
      }
      if (!BRIDGES.includes(seed.suggestedBridge)) {
        errors.push(`${p}.suggestedBridge must be one of ${BRIDGES.join('|')}`);
      }
      if (typeof seed.confidence !== 'number' || seed.confidence < 0 || seed.confidence > 1) {
        errors.push(`${p}.confidence must be a number in [0,1]`);
      }
      if (!Array.isArray(seed.evidenceRefs) || seed.evidenceRefs.length === 0) {
        errors.push(`${p}.evidenceRefs must be a non-empty array`);
        return;
      }
      for (const ref of seed.evidenceRefs) {
        if (!ref || typeof ref !== 'object') {
          errors.push(`${p}.evidenceRefs entry must be an object`);
          continue;
        }
        if (ref.kind === 'hit') {
          if (!Number.isInteger(ref.index) || ref.index < 0 || ref.index >= hitCount) {
            errors.push(`${p}.evidenceRefs hit index out of range`);
          }
        } else if (ref.kind === 'capability') {
          if (!Number.isInteger(ref.index) || ref.index < 0 || ref.index >= capCount) {
            errors.push(`${p}.evidenceRefs capability index out of range`);
          }
        } else {
          errors.push(`${p}.evidenceRefs.kind must be "hit" or "capability"`);
        }
      }
    });
  }

  return errors;
}

/**
 * Build phenotype + boonSeeds from search hits and SCDNA evidence.
 * Deterministic; no LLM.
 *
 * @param {{
 *   query: string,
 *   scope?: 'repo'|'divtube',
 *   engine?: string,
 *   hits: Array<{ path: string, score?: number, preview?: string, chunkIndex?: number }>,
 *   capabilities?: object[],
 *   genes?: string[],
 * }} input
 */
export function assemblePhenotypicIdealPacket(input) {
  const scope = input.scope === 'divtube' ? 'divtube' : 'repo';
  let hits = (input.hits || []).map((h) => ({
    path: String(h.path || ''),
    score: typeof h.score === 'number' ? h.score : 0,
    preview: String(h.preview || ''),
    chunkIndex: typeof h.chunkIndex === 'number' ? h.chunkIndex : 0,
  })).filter((h) => h.path);

  if (scope === 'divtube') {
    const div = hits.filter((h) => h.path.startsWith('divtube_downloader/'));
    if (div.length) hits = div;
  }

  const capabilities = Array.isArray(input.capabilities) ? input.capabilities : [];
  const genes = Array.isArray(input.genes) ? input.genes.map(String) : [];

  const idealPaths = [];
  for (const cap of capabilities) {
    for (const c of cap.capabilities || []) {
      if (c?.path) idealPaths.push({ domain: cap.domain, need: c.need, path: c.path, canonical: c.canonical });
    }
  }

  const observedPaths = [...new Set(hits.map((h) => h.path))];

  const idealSet = new Set(idealPaths.map((p) => p.path));
  const observedNotIdeal = observedPaths.filter((p) => !idealSet.has(p));
  const idealNotObserved = idealPaths.filter((p) => !observedPaths.includes(p.path));

  const phenotype = {
    ideal: idealPaths.length
      ? { summary: 'Reuse canonical capability paths', items: idealPaths }
      : { summary: 'No matched capability packets; ideal unknown', items: [] },
    observed: {
      summary: 'TurboQuant neighbor hit paths',
      items: observedPaths,
    },
    gap: {
      summary: idealPaths.length
        ? 'Hits not covered by capability canonicals, and canonicals not present in hits'
        : 'No capability archaeology — neighbor clusters only',
      hitsWithoutCapability: observedNotIdeal,
      capabilitiesWithoutHit: idealNotObserved,
    },
  };

  const boonSeeds = buildBoonSeeds(hits, capabilities, phenotype);

  return {
    contract: CONTRACT,
    version: VERSION,
    query: String(input.query || ''),
    scope,
    assembledAt: new Date().toISOString(),
    search: {
      engine: input.engine || 'float32-cosine-v1',
      hits,
    },
    evidence: {
      capabilities: capabilities.map(summarizeCapability),
      genes,
    },
    phenotype,
    boonSeeds,
  };
}

function summarizeCapability(cap) {
  return {
    domain: cap.domain,
    version: cap.version,
    surfaces: cap.surfaces || [],
    capabilities: (cap.capabilities || []).map((c) => ({
      need: c.need,
      canonical: c.canonical,
      path: c.path,
      forbidden: c.forbidden || [],
    })),
  };
}

function buildBoonSeeds(hits, capabilities, phenotype) {
  const seeds = [];

  // Seed type 1: capability present but hit path is a parallel surface (gap)
  capabilities.forEach((cap, capIdx) => {
    const parallelHits = hits
      .map((h, hi) => ({ h, hi }))
      .filter(({ h }) => {
        const surfaces = cap.surfaces || [];
        // Hit is in a related directory but not the canonical path
        const domainToken = String(cap.domain || '').toLowerCase();
        const pathLower = h.path.toLowerCase();
        const related = domainToken && pathLower.includes(domainToken);
        const isCanonical = (cap.capabilities || []).some((c) => c.path && h.path.includes(c.path));
        const onSurface = surfaces.some((s) => matchGlobish(h.path, s));
        return (related || onSurface) && !isCanonical;
      });

    if (parallelHits.length) {
      const first = parallelHits[0];
      seeds.push({
        titleHint: `Reconcile ${cap.domain} parallel with canonical capability`,
        classification: 'architectural',
        suggestedBridge: 'adapter',
        confidence: clamp01(0.55 + Math.min(0.35, first.h.score || 0)),
        evidenceRefs: [
          { kind: 'capability', index: capIdx },
          { kind: 'hit', index: first.hi },
        ],
      });
    }
  });

  // Seed type 2: neighbor cluster — multiple hits under same top-level dir, no capability
  const byDir = new Map();
  hits.forEach((h, hi) => {
    const top = h.path.split('/').slice(0, 2).join('/');
    if (!byDir.has(top)) byDir.set(top, []);
    byDir.get(top).push(hi);
  });

  for (const [dir, indices] of byDir) {
    if (indices.length < 2) continue;
    const covered = indices.some((hi) =>
      capabilities.some((cap) => (cap.surfaces || []).some((s) => matchGlobish(hits[hi].path, s))),
    );
    if (covered) continue;
    seeds.push({
      titleHint: `Shared contract for cluster under ${dir}`,
      classification: 'structural',
      suggestedBridge: 'schema',
      confidence: clamp01(0.35 + 0.05 * indices.length),
      evidenceRefs: indices.slice(0, 3).map((index) => ({ kind: 'hit', index })),
    });
  }

  // Seed type 3: capability without any hit — draft archaeology reminder
  if (capabilities.length && phenotype.gap.capabilitiesWithoutHit?.length) {
    seeds.push({
      titleHint: 'Capability archaeology unused by current neighbors',
      classification: 'behavioral',
      suggestedBridge: 'registry',
      confidence: 0.4,
      evidenceRefs: [{ kind: 'capability', index: 0 }],
    });
  }

  // Always at least one seed if we have hits (neighbor-only)
  if (!seeds.length && hits.length) {
    seeds.push({
      titleHint: 'Inspect TurboQuant neighbors for latent bridge',
      classification: 'structural',
      suggestedBridge: 'shared_util',
      confidence: 0.3,
      evidenceRefs: [{ kind: 'hit', index: 0 }],
    });
  }

  return seeds;
}

function matchGlobish(path, pattern) {
  // Minimal: exact, prefix/**, or substring of non-glob pattern
  if (!pattern) return false;
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return path === prefix || path.startsWith(prefix + '/');
  }
  if (pattern.includes('*')) {
    const re = new RegExp(
      '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$',
    );
    return re.test(path);
  }
  return path === pattern || path.startsWith(pattern + '/');
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}
