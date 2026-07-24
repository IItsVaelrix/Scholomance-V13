/**
 * Zod boundary schemas for the Career Graph contracts.
 *
 * These mirror `./contracts.ts` field-for-field and are the only sanctioned way
 * to admit external data (worker responses, persisted artifacts) into the Career
 * Graph type space. The policy bundle is validated with `z.literal` per field so a
 * version drift fails loudly at the boundary.
 */
import { z } from 'zod';
import { TextSpanSchema } from '../schemas';

export const SkillClassSchema = z.enum([
  'demonstrated',
  'adjacent',
  'missing',
  'not_required',
  'ambiguous',
]);

export const RequirementKindSchema = z.enum([
  'required',
  'preferred',
  'optional',
  'none',
]);

export const OccupationBucketSchema = z.enum(['exact', 'alias', 'fts']);

export const CareerGraphModeSchema = z.enum(['graph_semantic', 'graph', 'lexical']);

export const CareerPolicyBundleSchema = z.object({
  occupationInference: z.literal('occupation-inference-v1'),
  candidateFrontier: z.literal('career-frontier-v1'),
  relationTraversal: z.literal('career-traversal-v1'),
  shard: z.literal('career-shard-v1'),
  skillClassification: z.literal('career-evidence-v1'),
  scorecard: z.literal('career-scorecard-v2'),
  thresholdChecksum: z.string().min(1),
});

export const OccupationCandidateSchema = z.object({
  conceptId: z.string().min(1),
  label: z.string(),
  namespace: z.enum(['onet', 'esco']),
  socMajorGroup: z.string().optional(),
  family: z.string().optional(),
  score: z.number().min(0).max(1),
  bucket: OccupationBucketSchema,
  relationPath: z.array(z.string()),
  sources: z.array(z.string()),
  jobEvidence: z.array(TextSpanSchema),
});

export const SkillScoresSchema = z.object({
  job: z.number(),
  occupation: z.number(),
  resume: z.number(),
  semantic: z.number().nullable(),
});

export const SkillClassificationSchema = z.object({
  conceptId: z.string().min(1),
  label: z.string(),
  classification: SkillClassSchema,
  requirement: RequirementKindSchema,
  relationPath: z.array(z.string()),
  sources: z.array(z.string()),
  jobEvidence: z.array(TextSpanSchema),
  resumeEvidence: z.array(TextSpanSchema),
  scores: SkillScoresSchema,
});

export const CareerGraphDiagnosticSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(['info', 'warning', 'error']),
  message: z.string(),
});

export const CareerGraphAnalysisSchema = z.object({
  artifactId: z.string().min(1),
  policy: CareerPolicyBundleSchema,
  occupations: z.array(OccupationCandidateSchema),
  skills: z.array(SkillClassificationSchema),
  diagnostics: z.array(CareerGraphDiagnosticSchema),
  mode: CareerGraphModeSchema,
});

export const CareerGraphManifestSchema = z.object({
  artifactId: z.string().min(1),
  policy: z.string().min(1),
  sources: z.array(z.string()),
  conceptCount: z.number().int().nonnegative(),
  relationCount: z.number().int().nonnegative(),
  checksum: z.string().min(1),
});
