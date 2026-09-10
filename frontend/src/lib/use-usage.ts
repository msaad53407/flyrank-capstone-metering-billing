import { useCallback, useEffect, useState } from "react";
import { fetchUsage } from "@/lib/api";
import type { UsageResponse } from "@/lib/api";

export function useUsage(tenantId: string, pollMs = 5000) {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const usage = await fetchUsage(tenantId);
      setData(usage);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
    const timer = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(timer);
  }, [refresh, pollMs]);

  return { data, error, loading, refresh };
}

export async function checkBackend(): Promise<boolean> {
  try {
    const res = await fetch("/health");
    return res.ok;
  } catch {
    return false;
  }
}
