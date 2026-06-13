import axios, { AxiosError } from "axios";

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
