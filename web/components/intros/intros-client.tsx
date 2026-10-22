"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Copy, Download, Save, Send } from "lucide-react";

import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { IntroDraft } from "@/lib/contracts";
import { safeExternalUrl } from "@/components/projects/project-result";

type Draft = IntroDraft;

export function IntrosClient() {
  const searchParams = useSearchParams();
  const requestedProject = searchParams.get("project");
  const draftedProject = useRef<string | null>(null);
  const loadSequence = useRef(0);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = drafts.find((draft) => draft.id === activeId) ?? drafts[0] ?? null;

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/intros", { cache: "no-store" });
      const payload = await response.json().catch(() => null) as { drafts?: Draft[]; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Could not load drafts.");
      if (sequence !== loadSequence.current) return;
      const next = payload?.drafts ?? [];
      setDrafts(next);
      setActiveId((current) => current && next.some((draft) => draft.id === current) ? current : next[0]?.id ?? null);
    } catch (cause) {
      if (sequence === loadSequence.current) setError(cause instanceof Error ? cause.message : "Could not load drafts.");
    } finally {
      if (sequence === loadSequence.current) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, []);

  const createDraft = useCallback(async (projectId: string) => {
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/intro", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, intent: "Connect around related work" }),
      });
      const payload = await response.json().catch(() => null) as (Draft & { error?: string }) | null;
      if (!response.ok || !payload) throw new Error(payload?.error || "Could not create a draft.");
      setDrafts((current) => [payload, ...current.filter((draft) => draft.id !== payload.id)]);
      setActiveId(payload.id);
      setNotice("Draft created from public project evidence. Review it before using it.");
    } catch (cause) {
      draftedProject.current = null;
      setError(cause instanceof Error ? cause.message : "Could not create a draft.");
    } finally {
      setCreating(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    if (!loaded || !requestedProject || requestedProject === draftedProject.current) return;
    draftedProject.current = requestedProject;
    void createDraft(requestedProject);
  }, [createDraft, loaded, requestedProject]);

  function update(field: "subject" | "body", value: string) {
    if (!active) return;
    setDrafts((current) => current.map((draft) => draft.id === active.id ? { ...draft, [field]: value } : draft));
    setError(null);
    setNotice(null);
  }

  async function save() {
    if (!active || saving || sending) return;
    const draft = active;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/intros", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: draft.id, subject: draft.subject, body: draft.body }),
      });
      const payload = await response.json().catch(() => null) as (Draft & { error?: string }) | null;
      if (!response.ok || !payload) throw new Error(payload?.error || "Could not save changes.");
      setDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, ...payload } : item));
      setNotice("Saved as a draft.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(`${active.subject}\n\n${active.body}`);
      setError(null);
      setNotice("Copied to clipboard.");
    } catch {
      setError("Your browser could not copy this draft. Select the text and copy it manually.");
      setNotice(null);
    }
  }

  function download() {
    if (!active) return;
    const blob = new Blob([`${active.subject}\n\n${active.body}`], { type: "text/plain" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "afterlife-intro-draft.txt";
    anchor.click();
    URL.revokeObjectURL(href);
  }

  async function sendToZero() {
    if (!active || sending || saving) return;
    const draft = active;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/zero", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draftId: draft.id, projectId: draft.projectId, personName: draft.personName, subject: draft.subject, body: draft.body, evidence: draft.evidence }),
      });
      const payload = await response.json().catch(() => null) as { available?: boolean; message?: string; error?: string } | null;
      if (response.status === 503) {
        setNotice(payload?.message || "Zero draft creation is not configured. This draft has not been sent.");
        return;
      }
      if (!response.ok) throw new Error(payload?.error || payload?.message || "Could not send this draft to Zero.");
      setNotice(payload?.available ? "Draft saved in Zero for human review. Nothing has been sent." : payload?.message || "Zero did not accept this draft.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send this draft to Zero.");
    } finally {
      setSending(false);
    }
  }

  return <div className="space-y-7"><section className="border-b border-border pb-7"><h1 className="text-2xl font-semibold tracking-tight">Intro drafts</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Evidence-backed notes for builders and organisers. Nothing is sent automatically.</p>{creating ? <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Spinner />Creating a draft from the selected project…</p> : null}</section>{error ? <p role="alert" className="border border-destructive/30 bg-destructive/5 p-3 text-sm">{error}</p> : null}{notice ? <p role="status" className="border border-border bg-muted/40 p-3 text-sm">{notice}</p> : null}{loading ? <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground"><Spinner />Loading drafts…</div> : !drafts.length ? <section className="py-10 text-sm text-muted-foreground">No saved drafts. Open any project result and choose “Draft an intro” to create one.</section> : <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]"><aside className="border-b border-border pb-4 lg:border-r lg:border-b-0 lg:pr-4"><h2 className="text-sm font-semibold">Saved drafts</h2><div className="mt-3 flex gap-2 overflow-x-auto lg:block lg:space-y-1">{drafts.map((draft) => <button key={draft.id} type="button" onClick={() => setActiveId(draft.id)} className={`min-w-48 border px-3 py-2 text-left text-sm lg:w-full ${active?.id === draft.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}><span className="block truncate font-medium">{draft.personName || "Builder intro"}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{draft.subject}</span></button>)}</div></aside>{active ? <section><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{active.personName || "Intro draft"}</h2><p className="mt-1 text-xs text-muted-foreground">Created {new Date(active.created_at).toLocaleString()}</p></div><Badge variant="warning-light" size="sm" radius="full">Human review required</Badge></div><label className="mt-5 block text-sm font-medium">Subject<Input value={active.subject} onChange={(event) => update("subject", event.target.value)} className="mt-2" disabled={saving || sending} /></label><label className="mt-5 block text-sm font-medium">Message<textarea value={active.body} onChange={(event) => update("body", event.target.value)} className="mt-2 min-h-56 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" disabled={saving || sending} /></label><div className="mt-5 flex flex-wrap gap-2"><Button onClick={() => void save()} disabled={saving || sending}>{saving ? <Spinner /> : <Save />}Save draft</Button><Button variant="outline" onClick={() => void copy()} disabled={sending}><Copy />Copy</Button><Button variant="outline" onClick={download} disabled={sending}><Download />Download</Button><Button variant="outline" onClick={() => void sendToZero()} disabled={sending || saving}>{sending ? <Spinner /> : <Send />}{sending ? "Sending…" : "Send to Zero"}</Button></div><section className="mt-7 border-t border-border pt-5"><h3 className="font-semibold">Why this introduction</h3><p className="mt-1 text-sm text-muted-foreground">Keep these references with the draft so the recipient can verify the context.</p><div className="mt-3 flex flex-wrap gap-2">{active.evidence?.length ? active.evidence.map((evidence, index) => { const url = safeExternalUrl(evidence.url); return url ? <a key={index} href={url} target="_blank" rel="noreferrer" className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted">{evidence.source}: {evidence.label}</a> : <span key={index} className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">{evidence.source}: {evidence.label}</span>; }) : <p className="text-sm text-muted-foreground">No evidence was attached to this draft.</p>}</div></section></section> : null}</div>}</div>;
}
