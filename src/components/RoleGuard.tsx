import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/lib/types";

export function RoleGuard({ allow, children }: { allow: UserRole; children: ReactNode }) {
  const { profile, session, loading } = useAuth();
  if (loading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Cargando…</div>;
  }
  if (!session) return <Navigate to="/auth" replace />;
  if (!profile) return <Navigate to="/auth" replace />;
  if (profile.role !== allow) {
    return <Navigate to={profile.role === "platform_admin" ? "/admin" : "/restaurant"} replace />;
  }
  return <>{children}</>;
}