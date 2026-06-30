/**
 * Public inference page (`/predict`). No auth — sits inside RootLayout but
 * outside ProtectedRoute. Owns the textarea state and the request lifecycle;
 * the result rendering is delegated to the presentational <PredictResult/>.
 *
 * State ladder (mutually exclusive): submitting → error → result → idle.
 */
import { useState, type SubmitEvent } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { usePredict } from "@/api/predict";
import { ApiError } from "@/lib/api";
import { PredictResult } from "@/components/predict/PredictResult";

// The {modelId} path segment in POST /api/predict/{modelId}. Single source of
// truth — confirm it matches the id the backend registers DistilBERT under.
const MODEL_ID = "distilbert-cfpb";

export default function Predict() {
  const [text, setText] = useState("");
  const predict = usePredict(MODEL_ID);

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    predict.mutate({ text: trimmed });
  }

  // 503 is the live behaviour today (no model loaded / service starting), so it
  // gets a clearer message than the raw ProblemDetails would carry.
  const errorMessage = (() => {
    const err = predict.error;
    if (!err) return null;
    if (err instanceof ApiError && err.status === 503) {
      return "The model isn't available right now — the inference service may still be starting, or no model is loaded yet.";
    }
    return err instanceof Error ? err.message : "Something went wrong.";
  })();

  return (
    <section className="mx-auto max-w-3xl py-12 sm:py-16">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          Live model demo
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Try the classifier
        </h1>
        <p className="text-muted-foreground">
          Paste a snippet of text and the model predicts its category. Only
          high-confidence results are shown directly.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. I'd like to dispute a charge on my credit card statement…"
          rows={5}
          disabled={predict.isPending}
        />
        <Button type="submit" disabled={predict.isPending || !text.trim()}>
          {predict.isPending ? "Predicting…" : "Predict"}
        </Button>
      </form>

      {predict.isPending ? (
        <div className="mt-6 space-y-3 rounded-lg border border-border p-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : errorMessage ? (
        <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : predict.data ? (
        <PredictResult envelope={predict.data} />
      ) : null}
    </section>
  );
}
