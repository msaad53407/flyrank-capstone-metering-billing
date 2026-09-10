import { useMemo, useState } from "react";
import { Check, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { tokenCostCents } from "@/lib/api";

const VECTORS: { name: string; input: [number, number, number, number]; expected: number }[] = [
  { name: "Fresh input only", input: [1000, 0, 0, 0], expected: 15 },
  { name: "Cached input cheaper", input: [0, 1000, 0, 0], expected: 4 },
  { name: "Reasoning = output", input: [0, 0, 500, 500], expected: 60 },
  { name: "Mixed", input: [2000, 1000, 500, 500], expected: 94 },
];

export function Pricing() {
  const [input, setInput] = useState(2000);
  const [cached, setCached] = useState(1000);
  const [output, setOutput] = useState(500);
  const [reasoning, setReasoning] = useState(500);
  const [checked, setChecked] = useState<boolean[] | null>(null);

  const cost = useMemo(
    () => tokenCostCents(input, cached, output, reasoning),
    [input, cached, output, reasoning],
  );
  const parts = useMemo(
    () => [
      { label: "Input × 15", tokens: input, rate: 15 },
      { label: "Cached × 4", tokens: cached, rate: 4 },
      { label: "Output + reasoning × 60", tokens: output + reasoning, rate: 60 },
    ],
    [input, cached, output, reasoning],
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Pricing</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Token cost calculator</CardTitle>
            <CardDescription>Pinned v1 constants — same formula as the backend.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {(
              [
                ["Fresh input", input, setInput],
                ["Cached input", cached, setCached],
                ["Output", output, setOutput],
                ["Reasoning (billed as output)", reasoning, setReasoning],
              ] as const
            ).map(([label, value, set]) => (
              <div key={label} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <Label>{label}</Label>
                  <span className="font-mono text-muted-foreground">{value.toLocaleString()}</span>
                </div>
                <Slider
                  value={[value]}
                  max={100000}
                  step={100}
                  onValueChange={(v) => {
                    const first = Array.isArray(v) ? v[0] : v;
                    set(first ?? 0);
                  }}
                />
              </div>
            ))}
            <div className="rounded-lg bg-muted/60 p-3 font-mono text-sm">
              {parts.map((p) => (
                <div key={p.label} className="flex justify-between">
                  <span className="text-muted-foreground">{p.label}</span>
                  <span>
                    {p.tokens.toLocaleString()} → {((p.tokens * p.rate) / 1000).toFixed(2)}¢
                  </span>
                </div>
              ))}
              <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
                <span>Total (round half-up)</span>
                <span>{cost}¢</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Proof vectors</CardTitle>
            <CardDescription>The exact totals the backend must produce.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Check</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {VECTORS.map((v, i) => {
                  const got = tokenCostCents(...v.input);
                  const ok = checked ? checked[i] : got === v.expected;
                  return (
                    <TableRow key={v.name}>
                      <TableCell>{v.name}</TableCell>
                      <TableCell className="text-right font-mono">{v.expected}¢</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={ok ? "default" : "destructive"}>
                          {ok ? <Check className="size-3" /> : `${got}¢`}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Button
              variant="secondary"
              onClick={() =>
                setChecked(VECTORS.map((v) => tokenCostCents(...v.input) === v.expected))
              }
            >
              <FlaskConical className="size-4" /> Verify vectors
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
