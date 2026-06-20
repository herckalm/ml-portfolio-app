import { Routes, Route, Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { RootLayout } from "@/components/layout/RootLayout";
import Home from "@/pages/Home";
import PublicProfile from "@/pages/PublicProfile";
import Dashboard from "@/pages/Dashboard";
import ProjectForm from "@/pages/ProjectForm";
import ProjectDetail from "@/pages/ProjectDetail";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import NotFound from "@/pages/NotFound";

// guards AUTH-only routes. Reactive via useAuth(), so a logout re-renders this
// guard and bounces you immediately.
function ProtectedRoute() {
  const location = useLocation();
  const { isAuthed } = useAuth();
  if (!isAuthed) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      {/* main app shell: Navbar + <Outlet/> */}
      <Route element={<RootLayout />}>
        <Route index element={<Home />} />
        <Route path="u/:handle" element={<PublicProfile />} />
        <Route path="projects/:id" element={<ProjectDetail />} />

        {/* AUTH-only branch — everything inside requires a session */}
        <Route element={<ProtectedRoute />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="projects/new" element={<ProjectForm />} />
          <Route path="projects/:id/edit" element={<ProjectForm />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>

      {/* auth screens render bare — outside the shell, no navbar */}
      <Route path="login" element={<Login />} />
      <Route path="register" element={<Register />} />
    </Routes>
  );
}
