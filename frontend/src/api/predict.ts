/**
 * TanStack Query hooks for ML inference — the data-fetching layer over
 * `predictApi`. Both are `useMutation` (commands, not cached reads):
 * no query keys, no invalidation. The component owns the result via
 * the mutation's own state (`data` / `error` / `isPending`).
 */
import { useMutation } from "@tanstack/react-query";
import { predictApi } from "@/lib/api";
import type { PredictRequest } from "@/types/predict";

/** Bind a text predict call to a specific model id (e.g. "distilbert-cfpb"). */
export function usePredict(modelId: string) {
  return useMutation({
    mutationFn: (input: PredictRequest) => predictApi.predict(modelId, input),
  });
}

/** Bind an image predict call to a specific model id (e.g. "vit-cifar10"). */
export function usePredictImage(modelId: string) {
  return useMutation({
    mutationFn: (file: File) => predictApi.predictImage(modelId, file),
  });
}
