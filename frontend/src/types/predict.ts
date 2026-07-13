/**
 * Zod schemas and inferred types for the ML inference contract.
 *
 * Unlike the rest of the API (camelCase), the ml-service envelope is snake_case
 * — so this is the single boundary that parses snake_case fields. Runtime parsing
 * happens at the API-client boundary (`src/lib/api.ts`); downstream consumes the
 * inferred types.
 *
 * Two result shapes are served:
 *   - NLP (DistilBERT): `{ label, score, calibrated, confidence_band }`
 *     → UI shows label on "high", "please review" on "low"
 *   - CV (ViT-CIFAR-10): `{ label, score }`
 *     → UI shows label + score as a percentage; no confidence_band
 *
 * The envelope `result` field is parsed as a union of the two. The type guard
 * `isClassificationResult` distinguishes them at render time.
 */
import { z } from "zod";

// Request

/** Request body for `POST /api/predict/{modelId}`. */
export const predictRequestSchema = z.object({
  text: z.string().min(1),
});
export type PredictRequest = z.infer<typeof predictRequestSchema>;

// Result shapes

/**
 * NLP result: `{ label, score, calibrated, confidence_band }`.
 * Only `label` + `confidence_band` are load-bearing on the UI side.
 * `score`/`calibrated` are parsed permissively (type unconfirmed, never rendered)
 * so a wrong guess can't fail the parse.
 */
export const classificationResultSchema = z.object({
  label: z.string(),
  confidence_band: z.enum(["high", "low"]), // strict: rejects off-contract bands
  score: z.unknown().optional(),
  calibrated: z.unknown().optional(),
});
export type ClassificationResult = z.infer<typeof classificationResultSchema>;

/**
 * CV result: `{ label, score }`.
 * Score is a float in [0, 1]; the UI renders it as a percentage.
 * No `confidence_band` — the ViT-CIFAR-10 model doesn't emit one.
 */
export const imageClassificationResultSchema = z.object({
  label: z.string(),
  score: z.number().min(0).max(1),
});
export type ImageClassificationResult = z.infer<
  typeof imageClassificationResultSchema
>;

/**
 * Union of all known result shapes.
 * Zod tries `classificationResultSchema` first; if `confidence_band` is absent
 * it falls through to `imageClassificationResultSchema`.
 */
export const predictResultSchema = z.union([
  classificationResultSchema,
  imageClassificationResultSchema,
]);
export type PredictResult = z.infer<typeof predictResultSchema>;

/**
 * Type guard: narrows a `PredictResult` to `ClassificationResult`.
 * Use this in render logic instead of casting.
 */
export function isClassificationResult(
  r: PredictResult,
): r is ClassificationResult {
  return "confidence_band" in r;
}

/** `meta` — `demo_mode` defaults false so a non-demo response that omits it still parses. */
export const predictMetaSchema = z.object({
  demo_mode: z.boolean().default(false),
});
export type PredictMeta = z.infer<typeof predictMetaSchema>;

// Envelope

/** Full envelope: `{ model_id, model_version, result, meta }`. */
export const predictEnvelopeSchema = z.object({
  model_id: z.string(),
  model_version: z.string(),
  result: predictResultSchema,
  meta: predictMetaSchema,
});
export type PredictEnvelope = z.infer<typeof predictEnvelopeSchema>;
