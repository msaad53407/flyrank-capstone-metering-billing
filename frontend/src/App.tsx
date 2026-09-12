import { useCallback, useEffect, useMemo, useState } from "react";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { Layout } from "@/components/layout";
import { RegisterPage, SignInPage } from "@/pages/auth";
import { Billing } from "@/pages/billing";
import { Metering } from "@/pages/metering";
import { Overview } from "@/pages/overview";
import { Pricing } from "@/pages/pricing";
import { Quotas } from "@/pages/quotas";
import { Webhooks } from "@/pages/webhooks";
import {
  clearAuthToken,
  DEMO_TENANT,
  fetchMe,
  getAuthToken,
  newIdempotencyKey,
  setAuthToken,
  type TenantInfo,
} from "@/lib/api";
import { ShellContext, useShell } from "@/lib/shell-context";
import type { ShellCtx } from "@/lib/shell-context";
import { checkBackend } from "@/lib/use-usage";

function ShellProvider({ children }: { children: React.ReactNode }) {
  const [tenantId, setTenantId] = useState(DEMO_TENANT);
  const [currentTenant, setCurrentTenant] = useState<TenantInfo | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());
  const [backendUp, setBackendUp] = useState<boolean | null>(null);

  const ping = useCallback(async () => {
    setBackendUp(await checkBackend());
  }, []);

  useEffect(() => {
    void ping();
    const timer = setInterval(() => void ping(), 15000);
    return () => clearInterval(timer);
  }, [ping]);

  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      void fetchMe()
        .then((tenant) => {
          setCurrentTenant(tenant);
          setTenantId(tenant.id);
        })
        .catch(() => {
          clearAuthToken();
          setCurrentTenant(null);
        })
        .finally(() => {
          setAuthLoading(false);
        });
    } else {
      setAuthLoading(false);
    }
  }, []);

  const onTenantAuthenticated = useCallback((tenant: TenantInfo, token: string) => {
    setAuthToken(token);
    setCurrentTenant(tenant);
    setTenantId(tenant.id);
  }, []);

  const onLogout = useCallback(() => {
    clearAuthToken();
    setCurrentTenant(null);
    setTenantId(DEMO_TENANT);
  }, []);

  const ctx = useMemo<ShellCtx>(
    () => ({
      tenantId,
      onTenantChange: setTenantId,
      idempotencyKey,
      onRegenerateKey: () => setIdempotencyKey(newIdempotencyKey()),
      backendUp,
      currentTenant,
      isAuthenticated: Boolean(currentTenant),
      authLoading,
      onTenantAuthenticated,
      onLogout,
    }),
    [tenantId, idempotencyKey, backendUp, currentTenant, authLoading, onTenantAuthenticated, onLogout],
  );

  return <ShellContext.Provider value={ctx}>{children}</ShellContext.Provider>;
}

function ProtectedLayout() {
  const { currentTenant, authLoading } = useShell();

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-xs text-muted-foreground">Authenticating session…</p>
        </div>
      </div>
    );
  }

  if (!currentTenant) {
    return <Navigate to="/sign-in" replace />;
  }

  return <Layout />;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { currentTenant, authLoading } = useShell();

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (currentTenant) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <BrowserRouter basename="/demo">
        <ShellProvider>
          <Routes>
            {/* Public authentication routes */}
            <Route
              path="sign-in"
              element={
                <PublicOnlyRoute>
                  <SignInPage />
                </PublicOnlyRoute>
              }
            />
            <Route
              path="register"
              element={
                <PublicOnlyRoute>
                  <RegisterPage />
                </PublicOnlyRoute>
              }
            />
            {/* Alias /auth to /sign-in */}
            <Route path="auth" element={<Navigate to="/sign-in" replace />} />

            {/* Protected application routes */}
            <Route element={<ProtectedLayout />}>
              <Route index element={<Overview />} />
              <Route path="metering" element={<Metering />} />
              <Route path="quotas" element={<Quotas />} />
              <Route path="pricing" element={<Pricing />} />
              <Route path="billing" element={<Billing />} />
              <Route path="billing/success" element={<Billing />} />
              <Route path="webhooks" element={<Webhooks />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ShellProvider>
      </BrowserRouter>
      <Toaster richColors position="bottom-right" />
    </ThemeProvider>
  );
}
