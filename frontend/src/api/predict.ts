/**
 * TanStack Query hook for ML inference — the data-fetching layer over
 * `predictApi.predict`. It's a `useMutation` (a command, not a cached read):
 * no query keys, no invalidation. The component owns the result via the
 * mutation's own state (`data` / `error` / `isPending`).
 */
import { useMutation } from "@tanstack/react-query";
import { predictApi } from "@/lib/api";
import type { PredictRequest } from "@/types/predict";

/** Bind a predict call to a specific model id (e.g. "distilbert"). */
export function usePredict(modelId: string) {
  return useMutation({
    mutationFn: (input: PredictRequest) => predictApi.predict(modelId, input),
  });
}
