import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";
import { hasAuthTransition } from "../lib/route-transition";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isLoading) {
    return null;
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

export function GuestRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isLoading) {
    return null;
  }

  if (auth.isAuthenticated) {
    if (
      location.pathname === "/login" &&
      (auth.user?.needsPersonalDetails || hasAuthTransition(location.state))
    ) {
      return <>{children}</>;
    }

    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
