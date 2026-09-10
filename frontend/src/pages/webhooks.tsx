import { useState } from "react";
import { FlaskConical, RotateCcw, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ResponseView } from "@/components/response-view";
import { postWebhookEvent, signWebhook } from "@/lib/api";
import type { ApiResult } from "@/lib/api";
import { useShell } from "@/lib/shell-context";

type EventKind = "completed" | "updated" | "deleted";

function buildPayload(kind: EventKind, tenantId: string, eventId: string): string {
  const base = { id: eventId, object: "event" };
  if (kind === "completed") {
    return JSON.stringify(
      {
        ...base,
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_demo",
            object: "checkout.session",
            client_reference_id: tenantId,
            metadata: { tenant_id: tenantId },
            customer: "cus_demo",
            subscription: "sub_demo",
          },
        },
      },
      null,
      2,
    );
  }
  if (kind === "updated") {
    return JSON.stringify(
      {
        ...base,
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_demo",
            object: "subscription",
            status: "past_due",
            metadata: { tenant_id: tenantId },
          },
        },
      },
      null,
      2,
    );
  }
  return JSON.stringify(
    {
      ...base,
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_demo", object: "subscription", status: "canceled" } },
    },
    null,
    2,
  );
}

export function Webhooks() {
  const { tenantId } = useShell();
  const [kind, setKind] = useState<EventKind>("completed");
  const [secret, setSecret] = useState("whsec_test_phase3");
  const [raw, setRaw] = useState(() => buildPayload("completed", tenantId, "evt_demo_1"));
  const [forged, setForged] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);

  function rebuild(nextKind: EventKind) {
    setKind(nextKind);
    setRaw(buildPayload(nextKind, tenantId, `evt_demo_${Date.now() % 100000}`));
    setResult(null);
  }

  async function handleSend() {
    setSending(true);
    try {
      const sig = forged ? "t=123,v1=deadbeef" : await signWebhook(secret, raw);
      const res = await postWebhookEvent(raw, sig);
      setResult(res);
      if (res.status === 200 && !forged) {
        const body = res.body as { deduped?: boolean };
        toast.success(body.deduped ? "Replay ignored — processed once" : "Event applied");
      } else if (res.status === 400) {
        toast.error("Rejected (400) — nothing changed");
      } else {
        toast.info(`Status ${res.status}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Webhooks</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Event composer</CardTitle>
            <CardDescription>
              Signed locally with the test webhook secret — test key only, never a real one.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={kind} onValueChange={(v) => rebuild(v as EventKind)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="completed">completed</TabsTrigger>
                <TabsTrigger value="updated">updated</TabsTrigger>
                <TabsTrigger value="deleted">deleted</TabsTrigger>
              </TabsList>
            </Tabs>
            <div>
              <Label className="text-xs text-muted-foreground">Payload</Label>
              <Textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                className="mt-1 min-h-56 font-mono text-xs"
                spellCheck={false}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Webhook secret</Label>
              <Input
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="mt-1 font-mono text-xs"
                spellCheck={false}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void handleSend()} disabled={sending}>
                <Send className="size-4" /> Sign & send
              </Button>
              <Button variant="secondary" onClick={() => void handleSend()} disabled={sending}>
                <RotateCcw className="size-4" /> Replay same bytes
              </Button>
              <Button
                variant={forged ? "destructive" : "outline"}
                onClick={() => setForged((f) => !f)}
              >
                <TriangleAlert className="size-4" /> Forge: {forged ? "ON" : "OFF"}
              </Button>
            </div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <FlaskConical className="size-3" />
              {forged ? (
                <span>
                  Expect <Badge variant="outline" className="font-mono">400</Badge> and no plan
                  change.
                </span>
              ) : (
                <span>
                  Replay the identical bytes to prove idempotency (
                  <span className="font-mono">deduped: true</span>).
                </span>
              )}
            </p>
          </CardContent>
        </Card>
        <ResponseView title="Webhook response" result={result} />
      </div>
    </div>
  );
}
