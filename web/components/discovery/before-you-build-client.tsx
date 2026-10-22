"use client";

import { useRef, useState } from "react";
import { Search, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";

import { ProjectResult } from "@/components/projects/project-result";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { SearchResult } from "@/lib/contracts";

type SearchResponse = { query: string; results: SearchResult[]; summary?: string; mode?: string; warning?: string };
const examples = ["A WhatsApp bot for community events", "Voice agent memory for care teams", "Hardware tools for climate founders"];

export function BeforeYouBuildClient() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeOnly, setActiveOnly] = useState(false);
  const searchSequence = useRef(0);

  async function search(nextQuery = query, onlyActive = activeOnly) {
    const sequence = ++searchSequence.current;
    if (!nextQuery.trim()) { setError("Describe the thing you are considering building."); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: nextQuery, limit: 5, filters: onlyActive ? { liveness: "alive" } : undefined }) });
      const payload = await response.json() as SearchResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Search could not run.");
      if (sequence === searchSequence.current) setResult(payload);
    } catch (cause) {
      if (sequence === searchSequence.current) setError(cause instanceof Error ? cause.message : "Search could not run.");
    }
    finally { if (sequence === searchSequence.current) setLoading(false); }
  }

  return <div className="space-y-7">
    <section className="border-b border-border pb-7">
      <h1 className="text-2xl font-semibold tracking-tight">Before you build</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Search London hackathon memory for what has been tried, what lasted, and the builders behind it.</p>
      <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void search(); }}>
        <Input aria-label="Describe your idea" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Has anyone built…" className="h-10 flex-1" />
        <Button type="submit" size="lg" disabled={loading}>{loading ? <Spinner /> : <Search />}Search memory</Button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {examples.map((example) => <Button key={example} type="button" variant="ghost" size="sm" className="h-auto border border-border py-1.5 text-left text-xs" onClick={() => { setQuery(example); void search(example); }}>{example}</Button>)}
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground"><Checkbox checked={activeOnly} onCheckedChange={(checked) => { const onlyActive = Boolean(checked); setActiveOnly(onlyActive); if (result) void search(result.query, onlyActive); }} /> Active projects only</label>
      </div>
    </section>

    {error ? <section role="alert" className="border border-destructive/30 bg-destructive/5 p-4 text-sm"><p>{error}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void search()}><RotateCcw />Try again</Button></section> : null}
    {result ? <section aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-3"><div><h2 className="text-lg font-semibold">Closest prior work</h2><p className="mt-1 text-sm text-muted-foreground">{result.summary || `Results for “${result.query}”`}</p></div>{result.mode ? <Badge variant="outline" size="sm" radius="full">{result.mode === "openai" ? "AI ranked" : "Local ranking"}</Badge> : null}</div>
      {result.warning ? <p className="mt-3 text-xs text-muted-foreground">{result.warning}</p> : null}
      {result.results.length ? <div className="mt-5">{result.results.map((item) => <ProjectResult key={item.project.id} item={item} onDraft={(id) => router.push(`/intros?project=${encodeURIComponent(id)}`)} />)}</div> : <div className="py-10 text-sm text-muted-foreground">No matching projects yet. Try a broader problem or a different technology.</div>}
    </section> : <section className="py-8 text-sm text-muted-foreground">Start with an idea to find related projects and people with public evidence.</section>}
  </div>;
}
