import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { GuestRoute, ProtectedRoute } from "../components/RouteGuards";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { VerifyPage } from "../features/auth/VerifyPage";
import { ResendVerificationPage } from "../features/auth/ResendVerificationPage";
import { TransferPage } from "../features/transfer/TransferPage";
import { TransactionsPage } from "../features/transactions/TransactionsPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import ShaderBackground from "../components/ui/shader-background";

export function App() {
  const location = useLocation();

  return (
    <>
      <ShaderBackground />
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
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/transfer" element={<TransferPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
    </>
  );
}
