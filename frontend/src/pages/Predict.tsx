/**
 * Public inference page (`/predict`). No auth — sits inside RootLayout but
 * outside ProtectedRoute. Hosts two model demos as tabs:
 *   1. NLP — DistilBERT CFPB text classifier
 *   2. CV  — ViT-Tiny CIFAR-10 image classifier
 *
 * Each tab owns its own input + state ladder (idle → submitting → result/error).
 * Result rendering is delegated to the shared <PredictResult />.
 */
import { useState, useRef } from "react";
import { Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePredict, usePredictImage } from "@/api/predict";
import { ApiError } from "@/lib/api";
import { PredictResult } from "@/components/predict/PredictResult";

const NLP_MODEL_ID = "distilbert-cfpb";
const CV_MODEL_ID = "vit-cifar10";
const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

// NLP

function NlpTab() {
  const [text, setText] = useState("");
  const predict = usePredict(NLP_MODEL_ID);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    predict.mutate({ text: trimmed });
  }

  const errorMessage = (() => {
    const err = predict.error;
    if (!err) return null;
    if (err instanceof ApiError && err.status === 503)
      return "The model isn't available right now — the inference service may still be starting, or no model is loaded yet.";
    return err instanceof Error ? err.message : "Something went wrong.";
  })();

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Paste a snippet of consumer finance complaint text and the model
        predicts its CFPB category. Only high-confidence results are shown
        directly.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
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
        <div className="space-y-3 rounded-lg border border-border p-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : errorMessage ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : predict.data ? (
        <PredictResult envelope={predict.data} />
      ) : null}
    </div>
  );
}

// CV

function CvTab() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const predictImage = usePredictImage(CV_MODEL_ID);

  function applyFile(f: File) {
    if (!ACCEPTED_IMAGE_TYPES.includes(f.type)) return;
    setFile(f);
    predictImage.reset();
    setPreview(URL.createObjectURL(f));
  }

  function clearFile() {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    predictImage.reset();
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) applyFile(f);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) applyFile(f);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    predictImage.mutate(file);
  }

  const errorMessage = (() => {
    const err = predictImage.error;
    if (!err) return null;
    if (err instanceof ApiError && err.status === 503)
      return "The model isn't available right now — the inference service may still be starting, or no model is loaded yet.";
    if (err instanceof ApiError && err.status === 415)
      return "Unsupported image format. Please upload a JPEG, PNG, WebP, or GIF.";
    return err instanceof Error ? err.message : "Something went wrong.";
  })();

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Upload an image and the model classifies it into one of ten CIFAR-10
        categories: airplane, automobile, bird, cat, deer, dog, frog, horse,
        ship, or truck.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {!file ? (
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload image"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={[
              "flex cursor-pointer flex-col items-center justify-center gap-3",
              "rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors",
              dragOver
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-muted/40",
            ].join(" ")}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                Drop an image here or click to browse
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                JPEG, PNG, WebP, or GIF
              </p>
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-lg border border-border bg-muted/20">
            <img
              src={preview!}
              alt="Selected image preview"
              className="mx-auto max-h-64 w-auto object-contain py-3"
            />
            <button
              type="button"
              onClick={clearFile}
              aria-label="Remove image"
              className="absolute right-2 top-2 rounded-full bg-background/80 p-1 shadow hover:bg-background"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          onChange={handleFileChange}
          className="sr-only"
          aria-hidden="true"
        />

        <Button type="submit" disabled={predictImage.isPending || !file}>
          {predictImage.isPending ? "Classifying…" : "Classify image"}
        </Button>
      </form>

      {predictImage.isPending ? (
        <div className="space-y-3 rounded-lg border border-border p-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : errorMessage ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : predictImage.data ? (
        <PredictResult envelope={predictImage.data} />
      ) : null}
    </div>
  );
}

// page

export default function Predict() {
  return (
    <section className="mx-auto max-w-3xl py-12 sm:py-16">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          Live model demos
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Try the models
        </h1>
        <p className="text-muted-foreground">
          Two live demos — a text classifier and an image classifier. Switch
          between them below.
        </p>
      </div>

      <Tabs defaultValue="nlp" className="mt-8">
        <TabsList className="mb-6">
          <TabsTrigger value="nlp">Text classifier</TabsTrigger>
          <TabsTrigger value="cv">Image classifier</TabsTrigger>
        </TabsList>
        <TabsContent value="nlp">
          <NlpTab />
        </TabsContent>
        <TabsContent value="cv">
          <CvTab />
        </TabsContent>
      </Tabs>
    </section>
  );
}
