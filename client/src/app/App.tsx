import { Suspense, lazy } from "react";
import { MotionConfig } from "framer-motion";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { BootSplash } from "../components/BootSplash";
import { Skeleton } from "../components/Primitives";
import { GuestRoute, ProtectedRoute } from "../components/RouteGuards";
import { useAuth } from "../features/auth/AuthProvider";
import { CurrencyProvider } from "../features/currency/CurrencyProvider";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { VerifyPage } from "../features/auth/VerifyPage";
import { ResendVerificationPage } from "../features/auth/ResendVerificationPage";
import { TransferPage } from "../features/transfer/TransferPage";
import { TransactionsPage } from "../features/transactions/TransactionsPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { NotFoundPage } from "../features/not-found/NotFoundPage";
import ShaderBackground from "../components/ui/shader-background";

const AgentVideoSessionsPage = lazy(() =>
  import("../features/video/AgentVideoSessionsPage").then((module) => ({
    default: module.AgentVideoSessionsPage
  }))
);
const VideoSessionPage = lazy(() =>
  import("../features/video/VideoSessionPage").then((module) => ({
    default: module.VideoSessionPage
  }))
);
const UserProfilePage = lazy(() =>
  import("../features/users/UserProfilePage").then((module) => ({
    default: module.UserProfilePage
  }))
);

function RouteFallback() {
  return (
    <div className="page-stack">
      <Skeleton rows={4} />
    </div>
  );
}

export function App() {
  const location = useLocation();
  const { isLoading } = useAuth();

  return (
    <MotionConfig reducedMotion="user">
      <ShaderBackground />
      <BootSplash active={isLoading} />
      <div className="app-content-layer">
        <Routes location={location}>
          <Route
            path="/login"
            element={
              <GuestRoute>
                <LoginPage />
              </GuestRoute>
            }
          />
          <Route
            path="/register"
            element={
              <GuestRoute>
                <RegisterPage />
              </GuestRoute>
            }
          />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/resend-verification" element={<ResendVerificationPage />} />
          <Route
            element={
              <ProtectedRoute>
                <CurrencyProvider>
                  <AppShell />
                </CurrencyProvider>
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/transfer" element={<TransferPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route
              path="/users/:userId"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <UserProfilePage />
                </Suspense>
              }
            />
            <Route
              path="/video"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <VideoSessionPage />
                </Suspense>
              }
            />
            <Route
              path="/agent/video-sessions"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <AgentVideoSessionsPage />
                </Suspense>
              }
            />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
    </MotionConfig>
  );
}
