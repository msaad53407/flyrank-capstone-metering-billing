import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import confetti from "canvas-confetti";
import { ArrowRight, ArrowUpCircle, ExternalLink, PartyPopper, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
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

function fireConfetti() {
  // Center burst
  void confetti({
    particleCount: 90,
    spread: 70,
    origin: { y: 0.6 },
    colors: ["#6366f1", "#a855f7", "#ec4899", "#10b981", "#f59e0b"],
  });

  // Left cannon
  setTimeout(() => {
    void confetti({
      particleCount: 50,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.65 },
      colors: ["#6366f1", "#a855f7", "#3b82f6"],
    });
  }, 250);

  // Right cannon
  setTimeout(() => {
    void confetti({
      particleCount: 50,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.65 },
      colors: ["#ec4899", "#f59e0b", "#10b981"],
    });
  }, 450);
}

export function Billing() {
  const { tenantId } = useShell();
  const { data, refresh } = useUsage(tenantId);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const isSuccessUrl = location.pathname.includes("/billing/success") || Boolean(sessionId);

  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [confirmedSessionId, setConfirmedSessionId] = useState<string | null>(null);

  const handleDismiss = useCallback(() => {
    setShowSuccessDialog(false);
    navigate("/billing", { replace: true });
    void refresh();
  }, [navigate, refresh]);

  useEffect(() => {
    if (isSuccessUrl) {
      setShowSuccessDialog(true);
      if (sessionId) {
        setConfirmedSessionId(sessionId);
      }
      fireConfetti();
      toast.success("Payment confirmed! Welcome to Pro 🎉");

      // Replace URL quietly so the address bar remains http://localhost:8000/demo/billing
      navigate("/billing", { replace: true });

      // Immediate refresh + delayed retries to give the Stripe webhook time to land
      void refresh();
      const t1 = setTimeout(() => void refresh(), 1500);
      const t2 = setTimeout(() => void refresh(), 3500);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [isSuccessUrl, sessionId, navigate, refresh]);

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

      <Dialog open={showSuccessDialog} onOpenChange={(open) => !open && handleDismiss()}>
        <DialogPopup className="max-w-md p-6 text-center sm:text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary ring-8 ring-primary/5">
            <PartyPopper className="size-7 text-primary" />
          </div>

          <DialogHeader className="text-center sm:text-center">
            <DialogTitle className="flex items-center justify-center gap-2 text-xl font-bold">
              Payment Successful! <Sparkles className="size-5 text-amber-500" />
            </DialogTitle>
            <DialogDescription className="mt-1.5 text-sm text-muted-foreground">
              Your tenant account has been upgraded to the{" "}
              <span className="font-semibold text-foreground">Pro Plan</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="my-5 space-y-2.5 rounded-lg border border-border/80 bg-muted/40 p-4 text-left">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">New Tier</span>
              <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400">
                PRO ACTIVE
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Monthly API Quota</span>
              <span className="font-mono font-medium">10,000 calls</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Monthly Token Quota</span>
              <span className="font-mono font-medium">1,000,000 tokens</span>
            </div>
            {confirmedSessionId && (
              <div className="flex items-center justify-between border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                <span>Stripe Session</span>
                <span className="max-w-[180px] truncate font-mono">{confirmedSessionId}</span>
              </div>
            )}
          </div>

          <DialogFooter className="sm:justify-center">
            <Button className="w-full gap-1.5" onClick={handleDismiss}>
              <span>Continue to Billing</span>
              <ArrowRight className="size-4" />
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
