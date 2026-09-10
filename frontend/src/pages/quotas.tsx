import { useRef, useState } from "react";
import { OctagonX, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ResponseView } from "@/components/response-view";
import { newIdempotencyKey, postGenerate } from "@/lib/api";
import type { ApiResult } from "@/lib/api";
import { useShell } from "@/lib/shell-context";
import { useUsage } from "@/lib/use-usage";

export function Quotas() {
  const { tenantId } = useShell();
  const { data, refresh } = useUsage(tenantId);
  const [running, setRunning] = useState(false);
  const [sent, setSent] = useState(0);
  const [blocked, setBlocked] = useState<ApiResult | null>(null);
  const cancelRef = useRef(false);

  async function fillToQuota() {
    setRunning(true);
    setBlocked(null);
    setSent(0);
    cancelRef.current = false;
    let count = 0;
    try {
      for (;;) {
        if (cancelRef.current) break;
        const res = await postGenerate(tenantId, newIdempotencyKey(), {
          type: "api_call",
          qty: 1,
          input_tokens: 0,
          cached_input_tokens: 0,
          output_tokens: 0,
          reasoning_tokens: 0,
        });
        if (res.status === 429 || res.status === 402) {
          setBlocked(res);
          toast.warning(`Blocked with ${res.status} after ${count} requests`);
          break;
        }
        count += 1;
        setSent(count);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "fill failed");
    } finally {
      setRunning(false);
      void refresh();
    }
  }

  const apiPct = data && data.api.limit > 0 ? Math.min(100, (data.api.used / data.api.limit) * 100) : 0;
  const tokPct =
    data && data.tokens.limit > 0 ? Math.min(100, (data.tokens.used / data.tokens.limit) * 100) : 0;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Quotas</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Drive to the boundary</CardTitle>
            <CardDescription>
              Fires 1-call requests with fresh keys until the API returns 429 or 402.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              {!running ? (
                <Button onClick={() => void fillToQuota()}>
                  <Play className="size-4" /> Fill to quota
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  onClick={() => {
                    cancelRef.current = true;
                  }}
                >
                  <Square className="size-4" /> Stop ({sent} sent)
                </Button>
              )}
              {data && (
                <Badge variant="outline" className="font-mono">
                  {data.api.used}/{data.api.limit}
                </Badge>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>API calls</span>
                <span>{apiPct.toFixed(1)}%</span>
              </div>
              <Progress value={apiPct} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>AI tokens</span>
                <span>{tokPct.toFixed(1)}%</span>
              </div>
              <Progress value={tokPct} />
            </div>
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <OctagonX className="mt-0.5 size-3 shrink-0" />
              The request at the boundary succeeds; the next one is rejected. 429 carries a
              Retry-After with the seconds until the quota resets.
            </p>
          </CardContent>
        </Card>
        <ResponseView title="Blocking response" result={blocked} />
      </div>
    </div>
  );
}
