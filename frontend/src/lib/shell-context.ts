import { createContext, useContext } from "react";
import type { TenantInfo } from "./api";

export interface ShellCtx {
  tenantId: string;
  onTenantChange: (value: string) => void;
  idempotencyKey: string;
  onRegenerateKey: () => void;
  backendUp: boolean | null;
  currentTenant: TenantInfo | null;
  isAuthenticated: boolean;
  authLoading: boolean;
  onTenantAuthenticated: (tenant: TenantInfo, token: string) => void;
  onLogout: () => void;
}

export const ShellContext = createContext<ShellCtx | null>(null);

export function useShell(): ShellCtx {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside Shell");
  return ctx;
}
