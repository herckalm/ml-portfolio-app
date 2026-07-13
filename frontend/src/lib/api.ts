/**
 * Axios transport layer: the configured client, auth-token handling, error
 * normalization, and the raw request methods for every endpoint.
 *
 * This is the foundation the data-fetching layer sits on. The TanStack Query
 * hooks live one level out in `src/api/*` and *call* the `projectsApi` /
 * `usersApi` methods exported here — so note the two `api`-named layers:
 *   - `src/lib/api.ts`  (this file) — axios instance + raw async methods
 *   - `src/api/*.ts`               — useQuery/useMutation wrappers + cache keys
 *
 * Two cross-cutting guarantees every caller can rely on:
 *   1. Responses are Zod-parsed here, so callers receive validated, fully-typed
 *      data — date fields arrive as real `Date`, not strings.
 *   2. Failures reject with a normalized {@link ApiError} (`.message` + `.status`),
 *      never a raw AxiosError.
 *
 * Auth endpoints (register/login) are intentionally absent — they live with the
 * auth store, since they mint the token the rest of these calls depend on.
 */
import axios, { AxiosError } from "axios";
import {
  projectSchema,
  pagedProjectsSchema,
  userProfileSchema,
  type Project,
  type PagedProjects,
  type UserProfile,
  type CreateProjectInput,
  type UpdateProjectInput,
  type UpdateProfileInput,
} from "@/types/project";
import {
  predictEnvelopeSchema,
  type PredictEnvelope,
  type PredictRequest,
} from "@/types/predict";

const TOKEN_KEY = "mlp_token";

/**
 * Single chokepoint for the JWT in localStorage, so no other module hardcodes
 * the storage key. Auth writes via `.set`; the response interceptor and logout
 * clear via `.clear`.
 */
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "",
  headers: { "Content-Type": "application/json" },
});

// Request interceptor: attach the bearer token when present.
api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** TS mirror of the backend's RFC 7807 error envelope (ProblemDetails). */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  errors?: Record<string, string[]>;
}

/**
 * Normalized error type every caller sees on rejection. Flattens the backend's
 * ProblemDetails into a readable `.message` while preserving `.status` (for
 * branching, e.g. 404 vs 401) and the raw `.problem` (for field-level `errors`).
 */
export class ApiError extends Error {
  status?: number;
  problem?: ProblemDetails;
  constructor(message: string, status?: number, problem?: ProblemDetails) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }
}

/**
 * Response interceptor: centralizes 401 handling and converts every AxiosError
 * into an {@link ApiError}.
 *
 * @remarks
 * On 401 the token is cleared and the app hard-redirects to `/login` via
 * `window.location.href` (not the router). This is deliberate: a full reload
 * guarantees a clean auth reset — wiping in-memory state and the TanStack cache —
 * which router navigation alone wouldn't. The path guard avoids a redirect loop
 * when the 401 came from the login page itself.
 */
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ProblemDetails>) => {
    const status = error.response?.status;
    const problem = error.response?.data;

    if (status === 401) {
      tokenStore.clear();
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }

    const message =
      problem?.detail ??
      problem?.title ??
      error.message ??
      "Something went wrong.";

    return Promise.reject(new ApiError(message, status, problem));
  },
);

const DEFAULT_PAGE_SIZE = 10; // matches the backend's default page size

/**
 * Raw project endpoint methods. Each parses its response through the matching
 * Zod schema before returning. Auth/ownership requirements are noted per method;
 * the server enforces them — these comments document the contract, not a guard.
 */
export const projectsApi = {
  /** GET /api/projects — auth; the caller's own projects, all statuses incl. drafts. */
  getMine: async (
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  ): Promise<PagedProjects> => {
    const { data } = await api.get("/api/projects", {
      params: { page, pageSize },
    });
    return pagedProjectsSchema.parse(data);
  },

  /** GET /api/projects/{id} — public, published only (404 if draft or missing). */
  getById: async (id: number): Promise<Project> => {
    const { data } = await api.get(`/api/projects/${id}`);
    return projectSchema.parse(data);
  },

  /** POST /api/projects — auth; returns the new draft (201, isPublished:false). */
  create: async (input: CreateProjectInput): Promise<Project> => {
    const { data } = await api.post("/api/projects", input);
    return projectSchema.parse(data);
  },

  /**
   * PUT /api/projects/{id} — auth, owner only.
   *
   * @remarks Assumes the controller returns the updated DTO. If your endpoint
   * returns 204 NoContent instead, change the return type to `void` and drop
   * the `.parse` — otherwise this throws on an empty body.
   */
  update: async (id: number, input: UpdateProjectInput): Promise<Project> => {
    const { data } = await api.put(`/api/projects/${id}`, input);
    return projectSchema.parse(data);
  },

  /**
   * PATCH /api/projects/{id}/publish — auth, owner only. Same DTO-return
   * assumption as {@link projectsApi.update}.
   */
  setPublished: async (id: number, isPublished: boolean): Promise<Project> => {
    const { data } = await api.patch(`/api/projects/${id}/publish`, {
      isPublished,
    });
    return projectSchema.parse(data);
  },

  /** DELETE /api/projects/{id} — auth, owner only → 204 (no body). */
  remove: async (id: number): Promise<void> => {
    await api.delete(`/api/projects/${id}`);
  },
};

/**
 * Raw inference endpoint. Public, no auth (the request interceptor still attaches
 * a token if one happens to be present — harmless, the server ignores it). Parses
 * the snake_case envelope through Zod; failures reject as ApiError like everything
 * else, so the error path picks up RFC 7807 shaping for free once the backend
 * 422/404 thread lands.
 */
export const predictApi = {
  /** POST /api/predict/{modelId} — public. Returns the inference envelope. */
  predict: async (
    modelId: string,
    input: PredictRequest,
  ): Promise<PredictEnvelope> => {
    const { data } = await api.post(
      `/api/predict/${encodeURIComponent(modelId)}`,
      input,
    );
    return predictEnvelopeSchema.parse(data);
  },

  /**
   * POST /api/predict/{modelId}/image — public, no auth.
   * Sends the file as multipart/form-data under the key "file".
   * axios sets the Content-Type boundary automatically when given FormData.
   */
  predictImage: async (
    modelId: string,
    file: File,
  ): Promise<PredictEnvelope> => {
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.post(
      `/api/predict/${encodeURIComponent(modelId)}/image`,
      form,
    );
    return predictEnvelopeSchema.parse(data);
  },
};

/**
 * Raw user/profile endpoint methods. Same parse-on-return contract as
 * {@link projectsApi}. Public reads take a `handle`; `me` operations act on the
 * authenticated caller.
 */
export const usersApi = {
  /** GET /api/users/{handle} — public profile. */
  getProfile: async (handle: string): Promise<UserProfile> => {
    const { data } = await api.get(`/api/users/${encodeURIComponent(handle)}`);
    return userProfileSchema.parse(data);
  },

  /** GET /api/users/{handle}/projects — public, published only. */
  getProjects: async (
    handle: string,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  ): Promise<PagedProjects> => {
    const { data } = await api.get(
      `/api/users/${encodeURIComponent(handle)}/projects`,
      { params: { page, pageSize } },
    );
    return pagedProjectsSchema.parse(data);
  },

  /** PUT /api/users/me — auth; updates the caller's own profile. */
  updateMe: async (input: UpdateProfileInput): Promise<UserProfile> => {
    const { data } = await api.put("/api/users/me", input);
    return userProfileSchema.parse(data);
  },

  /**
   * DELETE /api/users/me — auth → 204 (no body). Permanently deletes the
   * caller's account; the server-side FK cascade removes all their projects too.
   */
  deleteMe: async (): Promise<void> => {
    await api.delete("/api/users/me");
  },
};
