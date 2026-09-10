import { createContext, useContext } from "react";

export interface ShellCtx {
  tenantId: string;
  onTenantChange: (value: string) => void;
  idempotencyKey: string;
  onRegenerateKey: () => void;
  backendUp: boolean | null;
}

export const ShellContext = createContext<ShellCtx | null>(null);

export function useShell(): ShellCtx {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside Shell");
  return ctx;
}
