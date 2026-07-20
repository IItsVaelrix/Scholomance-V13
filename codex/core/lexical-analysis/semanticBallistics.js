import { generatePhonosemanticVector } from '../semantic/vector.utils.js';
import {
  estimateInnerProduct,
  quantizeVectorJS,
} from '../quantization/turboquant.js';

export const BALLISTIC_EMBEDDING = Object.freeze({
  kind: 'phonosemantic_mock',
  version: 'tq-js-v1',
  dimensions: 256,
  seed: 42,
});

function fnv1a(bytes) {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function traceBuckets(data) {
  const bandSize = Math.ceil(data.length / 4);
  return Array.from({ length: 4 }, (_, index) => {
    const start = index * bandSize;
    const band = data.slice(start, Math.min(data.length, start + bandSize));
    return `qbit:${index}:${fnv1a(band)}`;
  });
}

export function createBallisticSignature(text) {
  const vector = generatePhonosemanticVector(text, BALLISTIC_EMBEDDING.dimensions);
  const { data, norm } = quantizeVectorJS(vector, BALLISTIC_EMBEDDING.seed);
  return Object.freeze({
    ...BALLISTIC_EMBEDDING,
    data,
    norm,
  });
}

export function compareBallisticSignatures(contextSignature, senseSignature) {
  const compatible = contextSignature
    && senseSignature
    && contextSignature.kind === senseSignature.kind
    && contextSignature.version === senseSignature.version
    && contextSignature.dimensions === senseSignature.dimensions
    && contextSignature.version !== 'unknown'
    && senseSignature.version !== 'unknown'
    && contextSignature.data?.length === senseSignature.data?.length;

  if (!compatible) {
    return Object.freeze({
      degradation: Object.freeze({
        code: 'embedding_metadata_mismatch',
        channel: 'semantics',
        reason: 'Context and sense signatures do not share kind, version, and dimensions.',
      }),
    });
  }

  const cosine = estimateInnerProduct(contextSignature.data, senseSignature.data, 1, 1);
  return Object.freeze({
    cosine,
    semanticScore: Math.max(0, Math.min(1, (cosine + 1) / 2)),
  });
}

function senseText(sense) {
  return [
    sense.lemma ?? '',
    sense.pos ?? '',
    sense.definition ?? '',
    ...(Array.isArray(sense.examples) ? sense.examples : []),
  ].join('\n');
}

export function scoreSenseBallistics(contextText, senses, options = {}) {
  const contextSignature = options.contextSignature ?? createBallisticSignature(contextText);
  const degradation = [];
  const scored = (Array.isArray(senses) ? senses : []).map((sense) => {
    const signature = createBallisticSignature(senseText(sense));
    const comparison = compareBallisticSignatures(contextSignature, signature);
    if (comparison.degradation) degradation.push(comparison.degradation);
    return Object.freeze({
      synsetId: String(sense.synsetId ?? ''),
      definition: String(sense.definition ?? ''),
      ...(comparison.semanticScore === undefined
        ? {}
        : { semanticScore: Number(comparison.semanticScore.toFixed(6)) }),
      bucketIds: traceBuckets(signature.data),
      embeddingKind: signature.kind,
      embeddingVersion: signature.version,
      embeddingDimensions: signature.dimensions,
    });
  });

  return Object.freeze({
    embedding: Object.freeze({
      kind: contextSignature.kind,
      version: contextSignature.version,
      dimensions: contextSignature.dimensions,
    }),
    senses: Object.freeze(scored),
    degradation: Object.freeze(degradation),
  });
}
