/**
 * Presentational result card for a single inference. Pure: given a parsed
 * envelope it decides what to show, holds no state, fires no requests.
 *
 * Two result shapes are handled:
 *   - NLP (ClassificationResult): confidence_band "high" → show label;
 *     "low" → suppress it and tell the user to review. Raw score never rendered.
 *   - CV (ImageClassificationResult): show label + score as a percentage.
 *     No confidence_band on this model.
 *
 * Both share the same card shell and the same demo_mode badge treatment.
 */
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { PredictEnvelope } from "@/types/predict";
import { isClassificationResult } from "@/types/predict";

/** "credit_card" → "Credit Card" for display. The raw label stays the contract value. */
function humanizeLabel(label: string): string {
  return label.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PredictResult({ envelope }: { envelope: PredictEnvelope }) {
  const { result, meta, model_id, model_version } = envelope;
  return (
    <Card className="mt-6">
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-muted-foreground">
            Prediction
          </span>
          {meta.demo_mode && <Badge variant="secondary">Demo mode</Badge>}
        </div>

        {isClassificationResult(result) ? (
          result.confidence_band === "high" ? (
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="space-y-1">
                <p className="text-2xl font-semibold tracking-tight">
                  {humanizeLabel(result.label)}
                </p>
                <p className="text-sm text-muted-foreground">High confidence</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div className="space-y-1">
                <p className="text-lg font-medium">Please review</p>
                <p className="text-sm text-muted-foreground">
                  The model wasn&apos;t confident enough to show a result
                  automatically. Check the input and try again, or interpret
                  with care.
                </p>
              </div>
            </div>
          )
        ) : (
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="space-y-1">
              <p className="text-2xl font-semibold tracking-tight">
                {humanizeLabel(result.label)}
              </p>
              <p className="text-sm text-muted-foreground">
                Confidence: {(result.score * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        )}

        {meta.demo_mode && (
          <p className="text-xs text-muted-foreground">
            No model is loaded — this is an illustrative response, not a real
            prediction.
          </p>
        )}
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          {model_id} · {model_version}
        </p>
      </CardContent>
    </Card>
  );
}
