import { createContext, useContext, useState, type ReactNode } from "react";
import { z } from "zod";
import { api, tokenStore } from "@/lib/api";

// authResponse lives here — it's auth's concern, not project.ts's.
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

// hydrate from storage, but only trust the session if a token is also present.
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
  // lazy initializer runs once on mount — session survives a page refresh,
  // and the very first render already knows whether you're logged in (no flash).
  const [user, setUser] = useState<AuthUser | null>(() => readSession());

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

  const logout = () => {
    tokenStore.clear();
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, isAuthed: !!user, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
