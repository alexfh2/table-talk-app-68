import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export default function RootRedirect() {
  const { session, profile, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Cargando…</div>;
  if (!session || !profile) return <Navigate to="/auth" replace />;
  return <Navigate to={profile.role === "platform_admin" ? "/admin" : "/restaurant"} replace />;
}