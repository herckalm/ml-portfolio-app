/**
 * Top navigation bar. Renders a different action set depending on auth state,
 * driven by {@link useAuth}: brand + Dashboard/Settings/Log-out when signed in,
 * Log-in/Sign-up when not. The "Live demo" link is public and always visible.
 */
import { Link, useNavigate } from "react-router-dom";
import { Boxes, LogOut, Settings, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthContext";

export function Navbar() {
  // Reactive: useAuth() re-renders this on login/logout, so the navbar flips
  // instantly — no full-page reload needed to swap the action set.
  const { isAuthed, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout(); // clears token + session, wipes the query cache, flips isAuthed
    navigate("/"); // soft client-side nav — deliberately not a window.location reload
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
          {/* Public — always visible */}
          <Button asChild variant="ghost" size="sm">
            <Link to="/predict" className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              Live demo
            </Link>
          </Button>

          {isAuthed ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/dashboard">Dashboard</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/settings">
                  <Settings className="mr-1.5 h-4 w-4" />
                  Settings
                </Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
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
