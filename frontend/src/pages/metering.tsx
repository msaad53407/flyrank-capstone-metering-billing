import { useState } from "react";
import { Copy, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponseView } from "@/components/response-view";
import { newIdempotencyKey, postGenerate } from "@/lib/api";
import type { ApiResult, GenerateBody, UsageType } from "@/lib/api";
import { useShell } from "@/lib/shell-context";

export function Metering() {
  const { tenantId, idempotencyKey, onRegenerateKey } = useShell();
  const [usageType, setUsageType] = useState<UsageType>("api_call");
  const [inputTokens, setInputTokens] = useState(1000);
  const [cachedTokens, setCachedTokens] = useState(0);
  const [outputTokens, setOutputTokens] = useState(500);
  const [reasoningTokens, setReasoningTokens] = useState(0);
  const [sending, setSending] = useState(false);
  const [first, setFirst] = useState<ApiResult | null>(null);
  const [second, setSecond] = useState<ApiResult | null>(null);

  const body: GenerateBody = {
    type: usageType,
    qty: 1,
    input_tokens: usageType === "ai_tokens" ? inputTokens : 0,
    cached_input_tokens: usageType === "ai_tokens" ? cachedTokens : 0,
    output_tokens: usageType === "ai_tokens" ? outputTokens : 0,
    reasoning_tokens: usageType === "ai_tokens" ? reasoningTokens : 0,
  };

  async function send(key: string): Promise<ApiResult> {
    return postGenerate(tenantId, key, body);
  }

  async function handleSend() {
    setSending(true);
    setSecond(null);
    try {
      setFirst(await send(idempotencyKey));
      toast.success("Request recorded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "request failed");
    } finally {
      setSending(false);
    }
  }

  async function handleSendTwice() {
    setSending(true);
    try {
      const key = newIdempotencyKey();
      const r1 = await send(key);
      const r2 = await send(key);
      setFirst(r1);
      setSecond(r2);
      const identical = JSON.stringify(r1.body) === JSON.stringify(r2.body);
      if (r1.status === 200 && identical) {
        toast.success("Exactly once: second response mirrors the first");
      } else {
        toast.info("Compare both responses below");
      }
      void navigator.clipboard?.writeText(key).catch(() => undefined);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "request failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Metering</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Billable request</CardTitle>
            <CardDescription>POST /generate with the key from the header bar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={usageType} onValueChange={(v) => setUsageType(v as UsageType)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="api_call">API call</TabsTrigger>
                <TabsTrigger value="ai_tokens">AI tokens</TabsTrigger>
              </TabsList>
            </Tabs>
            {usageType === "ai_tokens" ? (
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["Input", inputTokens, setInputTokens],
                    ["Cached input", cachedTokens, setCachedTokens],
                    ["Output", outputTokens, setOutputTokens],
                    ["Reasoning", reasoningTokens, setReasoningTokens],
                  ] as const
                ).map(([label, value, set]) => (
                  <div key={label}>
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={value}
                      onChange={(e) => set(Math.max(0, Number(e.target.value)))}
                      className="mt-1 font-mono"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline">qty = 1</Badge> one API call per request
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handleSend()} disabled={sending}>
                <Send className="size-4" /> Send
              </Button>
              <Button variant="secondary" onClick={() => void handleSendTwice()} disabled={sending}>
                <Copy className="size-4" /> Send twice, same key
              </Button>
              <Button variant="ghost" onClick={onRegenerateKey}>
                New key
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Reusing a key with a <em>different</em> payload returns 422 — try changing a
              number and resending with the same key.
            </p>
          </CardContent>
        </Card>
        <div className="space-y-4">
          <ResponseView title={second ? "First response" : "Response"} result={first} />
          {second && <ResponseView title="Second response (replay)" result={second} />}
        </div>
      </div>
    </div>
  );
}
