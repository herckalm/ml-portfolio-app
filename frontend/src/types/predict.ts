/**
 * Zod schemas and inferred types for the ML inference contract.
 *
 * Unlike the rest of the API (camelCase), the ml-service envelope is snake_case
 * — so this is the single boundary that parses snake_case fields. Runtime parsing
 * happens at the API-client boundary (`src/lib/api.ts`); downstream consumes the
 * inferred types.
 *
 * The UI keys off exactly two fields: `result.confidence_band` (show the label
 * only when "high") and `meta.demo_mode` (badge). Per the contract the raw score
 * is never rendered, so `score`/`calibrated` are parsed leniently and unused.
 */
import { z } from "zod";

/** Request body for `POST /api/predict/{modelId}`. */
export const predictRequestSchema = z.object({
  text: z.string().min(1),
});
export type PredictRequest = z.infer<typeof predictRequestSchema>;

/**
 * DistilBERT `result` shape: `{ label, score, calibrated, confidence_band }`.
 * Only `label` + `confidence_band` are load-bearing. `score`/`calibrated` are
 * parsed permissively (type unconfirmed, never rendered) so a wrong guess can't
 * fail the parse; any other model-specific keys are silently stripped by Zod.
 */
export const predictResultSchema = z.object({
  label: z.string(),
  confidence_band: z.enum(["high", "low"]), // strict: rejects an off-contract band
  score: z.unknown().optional(),
  calibrated: z.unknown().optional(),
});
export type PredictResult = z.infer<typeof predictResultSchema>;

/** `meta` — `demo_mode` defaults false so a non-demo response that omits it still parses. */
export const predictMetaSchema = z.object({
  demo_mode: z.boolean().default(false),
});
export type PredictMeta = z.infer<typeof predictMetaSchema>;

/** Full envelope: `{ model_id, model_version, result, meta }`. */
export const predictEnvelopeSchema = z.object({
  model_id: z.string(),
  model_version: z.string(),
  result: predictResultSchema,
  meta: predictMetaSchema,
});
export type PredictEnvelope = z.infer<typeof predictEnvelopeSchema>;
