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

const TOKEN_KEY = "mlp_token";

// a wrapper so the rest of the app never touches localStorage keys directly.
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "",
  headers: { "Content-Type": "application/json" },
});

// request interceptor: attach the bearer token if we have one
api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// mirrors my backend's error envelope.
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  errors?: Record<string, string[]>;
}

// normalized error every caller can rely on: error.message + error.status.
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

// response interceptor: central 401 handling + error normalization
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

// client methods — every response is parsed through its Zod schema, so callers
// receive validated, fully-typed data (createdAt/memberSince arrive as Date).
// Auth (register/login) is intentionally NOT here — it lands with the auth store.

const DEFAULT_PAGE_SIZE = 10; // backend default

export const projectsApi = {
  // GET /api/projects — AUTH, my projects (all statuses, incl. drafts)
  getMine: async (
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  ): Promise<PagedProjects> => {
    const { data } = await api.get("/api/projects", {
      params: { page, pageSize },
    });
    return pagedProjectsSchema.parse(data);
  },

  // GET /api/projects/{id} — public, published only (404 if draft/missing)
  getById: async (id: number): Promise<Project> => {
    const { data } = await api.get(`/api/projects/${id}`);
    return projectSchema.parse(data);
  },

  // POST /api/projects — AUTH → 201, returns the new draft (isPublished:false)
  create: async (input: CreateProjectInput): Promise<Project> => {
    const { data } = await api.post("/api/projects", input);
    return projectSchema.parse(data);
  },

  // PUT /api/projects/{id} — AUTH owner. ASSUMES the controller returns the updated DTO;
  // if yours returns 204 NoContent, change return type to void and drop the parse.
  update: async (id: number, input: UpdateProjectInput): Promise<Project> => {
    const { data } = await api.put(`/api/projects/${id}`, input);
    return projectSchema.parse(data);
  },

  // PATCH /api/projects/{id}/publish — AUTH owner. Same return assumption as update().
  setPublished: async (id: number, isPublished: boolean): Promise<Project> => {
    const { data } = await api.patch(`/api/projects/${id}/publish`, {
      isPublished,
    });
    return projectSchema.parse(data);
  },

  // DELETE /api/projects/{id} — AUTH owner → 204 (no body)
  remove: async (id: number): Promise<void> => {
    await api.delete(`/api/projects/${id}`);
  },
};

export const usersApi = {
  // GET /api/users/{handle} — public
  getProfile: async (handle: string): Promise<UserProfile> => {
    const { data } = await api.get(`/api/users/${encodeURIComponent(handle)}`);
    return userProfileSchema.parse(data);
  },

  // GET /api/users/{handle}/projects — public, published only
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

  // PUT /api/users/me — AUTH
  updateMe: async (input: UpdateProfileInput): Promise<UserProfile> => {
    const { data } = await api.put("/api/users/me", input);
    return userProfileSchema.parse(data);
  },
};
