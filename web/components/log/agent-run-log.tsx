"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";

type RunStatus = "ok" | "partial" | "failed";
type Run = { id: string | number; kind: string; status: RunStatus; input: unknown; output: unknown; error: string | null; created_at: string };
const statusVariant = { ok: "success-light", partial: "warning-light", failed: "destructive-light" } as const;

function compact(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > 1800 ? `${text.slice(0, 1800)}\n…truncated` : text;
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function AgentRunLog() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [filter, setFilter] = useState<"all" | RunStatus>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const load = useCallback(async (refresh = false) => {
    const sequence = ++requestSequence.current;
    if (refresh) {
      setRefreshing(true);
      setError(null);
    }
    try {
      const response = await fetch("/api/runs", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { runs?: Run[]; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Could not load the activity log.");
      if (sequence === requestSequence.current) setRuns(payload?.runs ?? []);
    } catch (loadError) {
      if (sequence === requestSequence.current) setError(loadError instanceof Error ? loadError.message : "Could not load the activity log.");
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  const visibleRuns = useMemo(() => filter === "all" ? runs : runs.filter((run) => run.status === filter), [filter, runs]);

  return <section className="afterlife-page">
    <div className="afterlife-page-heading afterlife-heading-with-action">
      <div><h1>Agent activity</h1><p>Operations are written here as they happen, including partial results and failures. Nothing is retried or hidden silently.</p></div>
      <Button variant="outline" onClick={() => void load(true)} disabled={loading || refreshing}>{refreshing ? "Refreshing…" : "Refresh"}</Button>
    </div>
    <div className="afterlife-log-toolbar" aria-label="Filter activity by result">
      {(["all", "ok", "partial", "failed"] as const).map((status) => <Button key={status} variant={filter === status ? "secondary" : "ghost"} size="sm" onClick={() => setFilter(status)} aria-pressed={filter === status}>{status === "all" ? `All (${runs.length})` : `${status[0].toUpperCase()}${status.slice(1)}`}</Button>)}
    </div>
    {error ? <div className="afterlife-panel afterlife-message afterlife-message-error" role="alert"><p>{error}</p><Button variant="outline" size="sm" onClick={() => void load(true)}>Try again</Button></div> : null}
    {loading ? <div className="afterlife-panel"><p className="afterlife-muted">Loading recorded operations…</p></div> : null}
    {!loading && !error && !runs.length ? <div className="afterlife-panel afterlife-empty"><h2>No operations recorded yet</h2><p>Search the map, look for speakers, or draft an introduction. Completed and failed operations will appear here with their inputs and results.</p></div> : null}
    {!loading && !error && runs.length && !visibleRuns.length ? <div className="afterlife-panel afterlife-empty"><h2>No {filter} operations</h2><p>Try another status filter to review recorded activity.</p></div> : null}
    {!loading && !error && visibleRuns.length ? <div className="afterlife-log-list">{visibleRuns.map((run) => <details className="afterlife-run" key={String(run.id)}><summary><div><span className="afterlife-run-kind">{run.kind}</span><span className="afterlife-run-time">{formatTime(run.created_at)} · {String(run.id)}</span></div><Badge variant={statusVariant[run.status]}>{run.status}</Badge></summary><div className="afterlife-run-detail"><div><h3>Input</h3><pre>{compact(run.input)}</pre></div><div><h3>Output</h3><pre>{compact(run.output)}</pre></div>{run.error ? <div><h3>Error</h3><pre className="afterlife-run-error">{run.error}</pre></div> : null}</div></details>)}</div> : null}
  </section>;
}
