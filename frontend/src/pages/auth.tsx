import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthSoon() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Auth</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Lock className="size-4" /> Coming with harness integration
            <Badge variant="outline">later</Badge>
          </CardTitle>
          <CardDescription>
            Per-user login, tenant memberships and API keys replace the X-Tenant-ID header.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Planned tables: <span className="font-mono">users</span>,{" "}
          <span className="font-mono">tenant_memberships</span>,{" "}
          <span className="font-mono">api_keys</span> — plus{" "}
          <span className="font-mono">usage_events.attributed_user_id</span> for per-user
          breakdowns. Quotas and Stripe stay tenant-level, so nothing here changes.
        </CardContent>
      </Card>
    </div>
  );
}
