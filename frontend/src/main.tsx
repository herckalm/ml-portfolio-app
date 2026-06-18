import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { ZodError } from "zod";
import { ApiError } from "@/lib/api";
import App from "./App.tsx";
import "./index.css";

// created at module scope — NOT inside a component — so it's one stable
// instance for the app's lifetime, recreating it on render would wipe the
// cache every time.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: (failureCount, error) => {
        if (
          error instanceof ApiError &&
          error.status != null &&
          error.status >= 400 &&
          error.status < 500
        ) {
          return false;
        }
        if (error instanceof ZodError) return false;
        return failureCount < 2;
      },
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
