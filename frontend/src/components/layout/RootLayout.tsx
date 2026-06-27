/**
 * Root layout shell: fixed navbar + a centered main column into which the
 * router renders the active route via <Outlet />. Wraps every page; mounted once
 * at the router root. Pure structure — no logic, no data.
 */
import { Outlet } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";

export function RootLayout() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
