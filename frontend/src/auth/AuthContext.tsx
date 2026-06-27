/**
 * Authentication context: owns the auth endpoints, the session lifecycle, and
 * the `user` state the rest of the app reads via {@link useAuth}.
 *
 * This is the counterpart to the `lib/api.ts` transport layer — auth lives here
 * deliberately, because login/register *mint* the token that every other request
 * depends on. It closes three loops referenced elsewhere:
 *   - the `/api/auth/*` calls intentionally absent from `lib/api.ts`,
 *   - the only writer of `tokenStore.set` (the request interceptor reads it),
 *   - `logout()` → `queryClient.clear()`, which `useDeleteAccount` relies on for
 *     teardown instead of doing its own cache surgery.
 *
 * Two storage keys back a session: the JWT (via `tokenStore`, key `mlp_token`)
 * and the cached user object (`mlp_session`). A session is only trusted when
 * *both* are present (see {@link readSession}).
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import { z } from "zod";
import { api, tokenStore } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

/** Login/register response. Defined here, not in `types/project.ts`, because
 *  the token-bearing auth payload is this module's concern alone. */
const authResponseSchema = z.object({
  token: z.string(),
  email: z.string(),
  role: z.string(),
  handle: z.string(),
});
type AuthResponse = z.infer<typeof authResponseSchema>;

type AuthUser = { handle: string; email: string; role: string };
type LoginInput = { email: string; password: string };
type RegisterInput = {
  email: string;
  password: string;
  handle?: string;
  displayName?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  isAuthed: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
};

const SESSION_KEY = "mlp_session";
const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Rehydrate the cached user from storage — but only if a token is also present.
 * The token is the source of truth; a session object without one is stale (e.g.
 * the interceptor cleared the token on a 401 but the page didn't reload) and is
 * treated as logged-out.
 */
function readSession(): AuthUser | null {
  if (!tokenStore.get()) return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Lazy initializer runs once on mount: the session survives a refresh, and the
  // first render already knows the auth state — no logged-out flash before hydration.
  const [user, setUser] = useState<AuthUser | null>(() => readSession());
  const queryClient = useQueryClient();

  /** Shared success path for login/register: persist token + session, set state. */
  const apply = (res: AuthResponse) => {
    tokenStore.set(res.token);
    const u: AuthUser = {
      handle: res.handle,
      email: res.email,
      role: res.role,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    setUser(u);
  };

  const login = async (input: LoginInput) => {
    const { data } = await api.post("/api/auth/login", input);
    apply(authResponseSchema.parse(data));
  };

  const register = async (input: RegisterInput) => {
    const { data } = await api.post("/api/auth/register", input);
    apply(authResponseSchema.parse(data));
  };

  /** Full teardown: clear token + session, drop user state, and wipe the entire
   *  TanStack cache so no previous user's data bleeds into the next session. */
  const logout = () => {
    tokenStore.clear();
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
    queryClient.clear();
  };

  return (
    <AuthContext.Provider
      value={{ user, isAuthed: !!user, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/** Access the auth context. Throws if used outside `<AuthProvider>` — a wiring
 *  bug, not a runtime condition, so it fails loud rather than returning null. */
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
