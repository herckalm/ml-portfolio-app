# auth/

Authentication: the session lifecycle and the `user` state the rest of the app
reads. One file, `AuthContext.tsx`, exposing `AuthProvider` and the `useAuth`
hook.

## What it owns

- **The auth endpoints.** `login` and `register` call `/api/auth/login` and
  `/api/auth/register` directly. These live here, not in `src/lib/api.ts`,
  because they _mint_ the token every other request depends on.
- **The session.** Two `localStorage` keys back a session: the JWT (via
  `tokenStore`, `mlp_token`) and the cached user object (`mlp_session`). A
  session is only trusted when **both** are present — a user object without a
  token is treated as logged-out (e.g. the interceptor cleared the token on a
  401 but the page hadn't reloaded yet).
- **The `user` state.** `AuthProvider` holds it; `useAuth()` exposes
  `{ user, isAuthed, login, register, logout }`. Components read `isAuthed`
  reactively, so the navbar and route guards flip on login/logout without a
  reload.

## The three loops it closes

This file is the other end of connections referenced across the codebase:

1. **The auth endpoints** deliberately absent from `src/lib/api.ts` are here.
2. It is the **only writer of `tokenStore.set`** — `lib/api.ts`'s request
   interceptor only reads the token; this file is what puts it there.
3. **`logout()` is the `queryClient.clear()`** that `useDeleteAccount` (in
   `src/api/users.ts`) relies on for teardown instead of doing its own cache
   surgery. `logout` clears the token, the session, the `user` state, and the
   entire TanStack cache — so no previous user's data bleeds into the next
   session.

## One detail worth knowing

The `user` state uses a **lazy initializer** (`useState(() => readSession())`),
so the session is rehydrated from storage exactly once on mount. This means the
very first render already knows whether you're logged in — no logged-out flash
before hydration, and the session survives a page refresh.
