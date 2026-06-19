import { Routes, Route, Outlet, Navigate, useLocation } from "react-router-dom";
import { tokenStore } from "@/lib/api";
import { RootLayout } from "@/components/layout/RootLayout";
import PublicProfile from "@/pages/PublicProfile";
import Dashboard from "@/pages/Dashboard";
import ProjectDetail from "./pages/ProjectDetail";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";

// guards AUTH-only routes. Reads the token directly for now; when we build the
// auth store this switches to useAuth() with the same redirect logic.
function ProtectedRoute() {
  const location = useLocation();
  if (!tokenStore.get()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      {/* main app shell: Navbar + <Outlet/>. RootLayout arrives in ⑫. */}
      <Route element={<RootLayout />}>
        <Route index element={<Home />} />
        <Route path="u/:handle" element={<PublicProfile />} />
        <Route path="projects/:id" element={<ProjectDetail />} />

        {/* AUTH-only branch — everything inside requires a token */}
        <Route element={<ProtectedRoute />}>
          <Route path="dashboard" element={<Dashboard />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>

      {/* auth screens render bare — outside the shell, no navbar */}
      <Route path="login" element={<Login />} />
      <Route path="register" element={<Register />} />
    </Routes>
  );
}
