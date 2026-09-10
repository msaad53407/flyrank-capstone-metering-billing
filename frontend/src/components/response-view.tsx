import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import type { ApiResult } from "@/lib/api";
import { cn } from "cn";

function statusTone(status: number): string {
  if (status >= 200 && status < 300) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (status === 429) return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  if (status === 402) return "bg-orange-500/15 text-orange-400 border-orange-500/30";
  return "bg-red-500/15 text-red-400 border-red-500/30";
}

export function ResponseView({ title, result }: { title: string; result: ApiResult | null }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {result && (
          <Badge variant="outline" className={cn("font-mono", statusTone(result.status))}>
            {result.status}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {!result ? (
          <p className="text-sm text-muted-foreground">No response yet — fire a request.</p>
        ) : (
          <div className="space-y-3">
            <pre className="max-h-64 overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-xs leading-relaxed">
              {JSON.stringify(result.body, null, 2)}
            </pre>
            {Object.keys(result.headers).length > 0 && (
              <Table>
                <TableBody>
                  {Object.entries(result.headers)
                    .filter(([k]) =>
                      ["retry-after", "content-type", "content-length"].includes(k.toLowerCase()),
                    )
                    .map(([k, v]) => (
                      <TableRow key={k}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{k}</TableCell>
                        <TableCell className="font-mono text-xs">{v}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
