import {
  Calculator,
  CreditCard,
  Gauge,
  LayoutDashboard,
  LogIn,
  LogOut,
  Moon,
  RotateCw,
  Sun,
  Webhook,
  Zap,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Outlet, useLocation, useNavigate } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useShell } from "@/lib/shell-context";
import { cn } from "cn";

const NAV: {
  to: string;
  label: string;
  icon: typeof Zap;
  disabled?: boolean;
}[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/metering", label: "Metering", icon: Zap },
  { to: "/quotas", label: "Quotas", icon: Gauge },
  { to: "/pricing", label: "Pricing", icon: Calculator },
  { to: "/billing", label: "Billing", icon: CreditCard },
  { to: "/webhooks", label: "Webhooks", icon: Webhook },
];

export function Layout() {
  const { theme, setTheme } = useTheme();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const {
    tenantId,
    onTenantChange,
    idempotencyKey,
    onRegenerateKey,
    backendUp,
    currentTenant,
    onLogout,
  } = useShell();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex items-center gap-2 px-5 pt-5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary font-mono text-sm font-bold text-primary-foreground">
            $
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">Metering</p>
            <p className="mt-1 text-xs text-muted-foreground">
              billing playground
            </p>
          </div>
        </div>
        <nav className="flex flex-col gap-1 px-3 py-5">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to;
            return (
              <Button
                key={item.to}
                variant={active ? "secondary" : "ghost"}
                className={cn("justify-start gap-2", active && "font-semibold")}
                disabled={item.disabled}
                onClick={() => void navigate(item.to)}
              >
                <Icon className="size-4" />
                {item.label}
              </Button>
            );
          })}
        </nav>
        <div className="mt-auto space-y-3 px-5 pb-5">
          <Separator />
          <div className="flex items-center gap-2 text-xs">
            <span
              className={cn(
                "size-2 rounded-full",
                backendUp === null
                  ? "bg-muted-foreground"
                  : backendUp
                    ? "bg-emerald-500"
                    : "bg-red-500",
              )}
            />
            <span className="text-muted-foreground">
              {backendUp === null
                ? "checking backend…"
                : backendUp
                  ? "backend connected"
                  : "backend down"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-col gap-3 border-b border-border bg-card/50 px-4 py-3 backdrop-blur lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="tenant" className="text-xs text-muted-foreground">
                Active Tenant ID
              </Label>
              {currentTenant ? (
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-foreground font-medium">
                    {currentTenant.name}
                  </span>
                  <Badge
                    variant="secondary"
                    className="px-1.5 py-0 text-[10px] capitalize"
                  >
                    {currentTenant.plan_id}
                  </Badge>
                </div>
              ) : null}
            </div>
            <Input
              id="tenant"
              value={tenantId}
              onChange={(e) => onTenantChange(e.target.value)}
              className="mt-1 font-mono text-xs"
              spellCheck={false}
              readOnly
            />
          </div>

          <div className="min-w-0 flex-1">
            <Label htmlFor="idem-key" className="text-xs text-muted-foreground">
              Idempotency-Key
            </Label>
            <div className="mt-1 flex gap-2">
              <Input
                id="idem-key"
                value={idempotencyKey}
                readOnly
                className="font-mono text-xs"
                spellCheck={false}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={onRegenerateKey}
                title="Generate new key"
              >
                <RotateCw className="size-4" />
              </Button>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2 self-end pb-0.5">
            {currentTenant ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onLogout();
                  void navigate("/sign-in");
                }}
                className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                title="Sign out of current tenant session"
              >
                <LogOut className="size-3.5" /> Sign Out
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={() => void navigate("/sign-in")}
                className="gap-1.5 text-xs"
              >
                <LogIn className="size-3.5" /> Sign In / Demo
              </Button>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-4 lg:p-6">
          <Outlet />
        </main>
        <nav className="sticky bottom-0 flex gap-1 overflow-x-auto border-t border-border bg-card p-2 md:hidden">
          {NAV.map((item) => (
            <Button
              key={item.to}
              variant={pathname === item.to ? "secondary" : "ghost"}
              size="sm"
              disabled={item.disabled}
              onClick={() => void navigate(item.to)}
            >
              {item.label}
            </Button>
          ))}
        </nav>
      </div>
    </div>
  );
}
