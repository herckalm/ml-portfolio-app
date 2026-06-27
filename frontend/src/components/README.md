# components/

Reusable UI. Three subfolders, two of them hand-written and documented here; the
third is generated.
components/

├── layout/ ← app shell (navbar + root layout)

├── projects/ ← the project gallery feature

└── ui/ ← shadcn/ui primitives (generated — see below)

## `ui/` — generated, out of scope

These are shadcn/ui primitives (`button`, `card`, `badge`, `input`, `textarea`,
`skeleton`, `alert-dialog`, …) scaffolded by the shadcn CLI and styled with the
project's Tailwind tokens. They are not hand-authored and carry no project
logic, so they're left as the CLI produced them — no per-file doc comments, the
same way the backend treats EF Core migrations. Everything below builds on top of
them.

## `layout/` — the app shell

- **`RootLayout`** — the frame every route renders into: a fixed navbar above a
  centered `<main>` with an `<Outlet />`. Pure structure, mounted once at the
  router root.
- **`Navbar`** — the top bar. Reads `isAuthed` from `useAuth`, so it swaps its
  action set reactively on login/logout (no reload). Its logout handler clears
  the session and does a _soft_ client-side nav home — deliberately not a
  `window.location` reload.

## `projects/` — the gallery feature

Three components composing one feature, leaf to composer:

- **`CategoryFilter`** — controlled row of domain toggle buttons. Owns no state;
  options are `PROJECT_DOMAINS` plus an explicit `"all"` no-filter sentinel.
- **`ProjectCard`** — presentational card for one project. No data fetching, no
  mutations: any action buttons are _injected_ by the parent via an `actions`
  prop, which is what keeps it reusable across the owner dashboard and public
  profile unchanged.
- **`ProjectGallery`** — composes the other two into a grid with pagination and
  the full set of load states (error / loading skeletons / empty / filtered-empty).
  Fully controlled: the parent owns the data and pagination and passes a
  `renderActions` callback to inject per-card buttons.

### Two patterns worth knowing

- **Presentational, parent-driven.** Nothing in `projects/` fetches or mutates.
  Data and behavior come down as props (`projects`, `renderActions`, `owned`),
  so the same components serve both the owner view (Dashboard) and the public
  view (PublicProfile) with no branching inside them. The mutation hooks are
  called by the _pages_, not here.
- **The filter is client-side and page-local.** `ProjectGallery`'s domain filter
  narrows only the _current page's_ array, while pagination is server-side. That
  interaction is the reason there are two distinct empty states — "no projects at
  all" vs "none in this domain on this page." A domain present on another page
  won't appear until that page loads. (Documented in full at the file level in
  `ProjectGallery.tsx`.)
