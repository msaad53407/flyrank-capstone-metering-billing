import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useShell } from "@/lib/shell-context";
import { useUsage } from "@/lib/use-usage";

const DEMO_SCRIPT: { probe: string; text: string; page: string }[] = [
  { probe: "Probe 1", text: "Send the same request twice with one key → one usage event", page: "/metering" },
  { probe: "Probe 2", text: "Fill a tenant to quota → 429 with Retry-After", page: "/quotas" },
  { probe: "Probe 3", text: "Test Checkout → webhook flips Free → Pro", page: "/billing" },
  { probe: "Probe 4", text: "Forged webhook → 400 · replay → processed once", page: "/webhooks" },
  { probe: "Probe 5", text: "Cached-input vs reasoning math → exact totals", page: "/pricing" },
];

function pct(used: number, limit: number): number {
  return limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
}

export function Overview() {
  const { tenantId } = useShell();
  const navigate = useNavigate();
  const { data, error, loading, refresh } = useUsage(tenantId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : error || !data ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">
            {error ?? "No usage data."} Check the tenant ID and backend status.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Plan · {data.period}</CardDescription>
              <CardTitle className="flex items-center gap-2 text-2xl capitalize">
                {data.plan}
                <Badge variant="outline">{data.tenant_id.slice(0, 8)}…</Badge>
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>API calls</CardDescription>
              <CardTitle className="text-2xl font-mono">
                {data.api.used.toLocaleString()}
                <span className="text-sm text-muted-foreground"> / {data.api.limit.toLocaleString()}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={pct(data.api.used, data.api.limit)} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>AI tokens</CardDescription>
              <CardTitle className="text-2xl font-mono">
                {data.tokens.used.toLocaleString()}
                <span className="text-sm text-muted-foreground">
                  {" "}
                  / {data.tokens.limit.toLocaleString()}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={pct(data.tokens.used, data.tokens.limit)} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Month cost</CardDescription>
              <CardTitle className="text-2xl font-mono">
                ${(data.cost_cents / 100).toFixed(2)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {data.cost_cents}¢ · pricing v{data.pricing_version}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Demo script — one button per probe</CardTitle>
          <CardDescription>Walk the acceptance probes live, in order.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {DEMO_SCRIPT.map((step) => (
            <div
              key={step.probe}
              className="flex items-center gap-3 rounded-lg border border-border p-3"
            >
              <Badge variant="secondary" className="font-mono">
                {step.probe}
              </Badge>
              <p className="flex-1 text-sm text-muted-foreground">{step.text}</p>
              <Button variant="ghost" size="sm" onClick={() => void navigate(step.page)}>
                Open <ArrowRight className="size-3" />
              </Button>
            </div>
          ))}
          <p className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3" /> Alerts (80%/100%) land in the outbox; watch
            Mailpit at :8025 when running compose.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
