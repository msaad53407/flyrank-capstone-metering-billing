import { useState } from "react";
import { ArrowUpCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { postCheckout } from "@/lib/api";
import { useShell } from "@/lib/shell-context";
import { useUsage } from "@/lib/use-usage";

const STATUS_MAP = [
  ["checkout.session.completed", "plan → pro · status → active"],
  ["subscription active / trialing", "status → active (plan kept)"],
  ["subscription past_due", "status → past_due · usage → 402 until paid"],
  ["subscription deleted / canceled", "plan → free · status → active (downgrade)"],
];

export function Billing() {
  const { tenantId } = useShell();
  const { data, refresh } = useUsage(tenantId);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upgrade() {
    setBusy(true);
    try {
      const res = await postCheckout(tenantId);
      const body = res.body as { url?: string; detail?: string };
      if (res.status === 200 && body.url) {
        setUrl(body.url);
        window.open(body.url, "_blank", "noopener");
        toast.success("Checkout opened — pay with 4242…");
      } else {
        toast.error(body.detail ?? `Checkout failed (${res.status})`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "checkout failed");
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Billing</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Subscription</CardTitle>
            <CardDescription>Stripe test mode — no real money, ever.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Current plan</span>
              <Badge variant="secondary" className="capitalize">
                {data?.plan ?? "…"}
              </Badge>
            </div>
            <Button onClick={() => void upgrade()} disabled={busy}>
              <ArrowUpCircle className="size-4" /> Upgrade to Pro
            </Button>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-mono text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Checkout session <ExternalLink className="size-3" />
              </a>
            )}
            <p className="text-xs text-muted-foreground">
              Pay with <span className="font-mono">4242 4242 4242 4242</span>, any future expiry.
              The <span className="font-mono">checkout.session.completed</span> webhook flips the
              tenant to Pro — watch the plan badge change, then check Overview limits (10k / 1M).
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Webhook → plan mapping</CardTitle>
            <CardDescription>How each Stripe event syncs the tenant.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {STATUS_MAP.map(([event, effect]) => (
                  <TableRow key={event}>
                    <TableCell className="font-mono text-xs">{event}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{effect}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
