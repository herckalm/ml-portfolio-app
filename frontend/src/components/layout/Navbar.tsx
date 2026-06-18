import { Link } from "react-router-dom";
import { Boxes, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tokenStore } from "@/lib/api";

export function Navbar() {
  // Read once per render. localStorage is NOT reactive — this navbar won't flip
  // on login/logout from client navigation alone. The auth store (later) fixes
  // that; until then logout does a hard redirect to force a clean render.
  const isAuthed = !!tokenStore.get();

  const logout = () => {
    tokenStore.clear();
    window.location.assign("/");
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link
          to="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <Boxes className="h-5 w-5 text-primary" />
          <span>ML Portfolio Hub</span>
        </Link>

        <div className="flex items-center gap-1">
          {isAuthed ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/dashboard">Dashboard</Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={logout}>
                <LogOut className="mr-1.5 h-4 w-4" />
                Log out
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">Log in</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/register">Sign up</Link>
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
