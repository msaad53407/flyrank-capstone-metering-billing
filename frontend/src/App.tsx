import { useCallback, useEffect, useMemo, useState } from "react";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Route, Routes } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { Layout } from "@/components/layout";
import { AuthSoon } from "@/pages/auth";
import { Billing } from "@/pages/billing";
import { Metering } from "@/pages/metering";
import { Overview } from "@/pages/overview";
import { Pricing } from "@/pages/pricing";
import { Quotas } from "@/pages/quotas";
import { Webhooks } from "@/pages/webhooks";
import { DEMO_TENANT, newIdempotencyKey } from "@/lib/api";
import { ShellContext } from "@/lib/shell-context";
import type { ShellCtx } from "@/lib/shell-context";
import { checkBackend } from "@/lib/use-usage";

function Shell() {
  const [tenantId, setTenantId] = useState(DEMO_TENANT);
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

  const ctx = useMemo<ShellCtx>(
    () => ({
      tenantId,
      onTenantChange: setTenantId,
      idempotencyKey,
      onRegenerateKey: () => setIdempotencyKey(newIdempotencyKey()),
      backendUp,
    }),
    [tenantId, idempotencyKey, backendUp],
  );

  return (
    <ShellContext.Provider value={ctx}>
      <Layout />
    </ShellContext.Provider>
  );
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <BrowserRouter basename="/demo">
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Overview />} />
            <Route path="metering" element={<Metering />} />
            <Route path="quotas" element={<Quotas />} />
            <Route path="pricing" element={<Pricing />} />
            <Route path="billing" element={<Billing />} />
            <Route path="webhooks" element={<Webhooks />} />
            <Route path="auth" element={<AuthSoon />} />
            <Route path="*" element={<Overview />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="bottom-right" />
    </ThemeProvider>
  );
}
