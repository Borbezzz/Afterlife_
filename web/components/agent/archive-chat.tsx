"use client";

/**
 * Chat panel, user bubble, reply sections, composer and transition grammar
 * adapted from BeautifulUI ChatComposer (MIT):
 * https://www.beautifului.dev/r/chat-composer.json
 * Scripted demo phases are replaced by a live CopilotKit agent.
 */
import { useAgent, useCopilotKit } from "@copilotkit/react-core/v2";
import { useEffect, useMemo, useRef, useState } from "react";
import { AfterlifeCopilotProvider } from "./copilot-provider";

interface MapActions { highlight?: string[]; focus?: string; axes?: string[] }
interface SourceLink { label: string; url: string }
type ToolResult = { actions?: MapActions; evidence?: SourceLink[]; results?: { evidence?: SourceLink[] }[]; candidates?: { evidence?: SourceLink[] }[] };

function sourceLinks(value: ToolResult) {
  const evidence = [...(value.evidence || []), ...(value.results || []).flatMap((item) => item.evidence || []), ...(value.candidates || []).flatMap((item) => item.evidence || [])];
  return [...new Map(evidence.filter((item) => item && typeof item.url === "string" && /^https?:\/\//i.test(item.url)).map((item) => [item.url, item])).values()].slice(0, 8);
}

const prompts = [
  "Who has built tools for community events?",
  "Show deep tech and climate projects with public momentum",
  "Find speakers on AI agent memory",
];

function sendMapActions(actions?: MapActions) {
  if (actions) window.dispatchEvent(new CustomEvent("afterlife:map-action", { detail: actions }));
}

function linkedText(text: string) {
  return text.split(/(https?:\/\/[^\s)\]]+)/g).map((part, index) => /^https?:\/\//.test(part)
    ? <a key={index} href={part.replace(/[.,;]+$/, "")} target="_blank" rel="noreferrer" className="break-all underline underline-offset-4">{part}</a>
    : part);
}

function ChatContent() {
  const { agent, isReady } = useAgent({ agentId: "default", throttleMs: 70 });
  const { copilotkit } = useCopilotKit();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [sources, setSources] = useState<SourceLink[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const processed = useRef(new Set<string>());
  const cancelled = useRef(false);
  const fallbackRequest = useRef<AbortController | null>(null);
  const toolSources = useMemo(() => {
    for (const message of [...agent.messages].reverse()) {
      if (message.role !== "tool" || typeof message.content !== "string") continue;
      try {
        const links = sourceLinks(JSON.parse(message.content) as ToolResult);
        if (links.length) return links;
      } catch { /* Tool content may still be streaming. */ }
    }
    return [];
  }, [agent.messages]);
  const visibleSources = toolSources.length ? toolSources : sources;

  useEffect(() => {
    for (const message of agent.messages) {
      if (message.role !== "tool" || processed.current.has(message.id) || typeof message.content !== "string") continue;
      try {
        const value = JSON.parse(message.content) as ToolResult;
        processed.current.add(message.id);
        sendMapActions(value.actions);
      } catch { /* Tool arguments/results may still be streaming. */ }
    }
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [agent.messages]);

  async function send(text: string) {
    const query = text.trim();
    if (!query || busy) return;
    setDraft("");
    setNotice("");
    setBusy(true);
    cancelled.current = false;
    agent.addMessage({ id: crypto.randomUUID(), role: "user", content: query });
    try {
      if (!isReady) throw new Error("Agent connection is still starting");
      await copilotkit.runAgent({ agent });
    } catch {
      if (cancelled.current) return;
      // A transport/provider failure still leaves the archive usable and logged.
      try {
        fallbackRequest.current = new AbortController();
        const response = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: query }), signal: fallbackRequest.current.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Archive search failed");
        agent.addMessage({ id: crypto.randomUUID(), role: "assistant", content: result.answer });
        sendMapActions(result.actions);
        setSources(sourceLinks(result).slice(0, 6));
        setNotice(result.mode === "local" ? "Answered from the local archive; live model connection was unavailable." : "Answered through the archive fallback connection.");
      } catch (error) { if (!cancelled.current) setNotice(error instanceof Error ? error.message : "The assistant could not connect. Please retry."); }
    } finally { fallbackRequest.current = null; setBusy(false); inputRef.current?.focus(); }
  }

  const visibleMessages = agent.messages.filter((message) => (message.role === "user" || message.role === "assistant") && typeof message.content === "string" && message.content.trim());
  return (
    <section aria-label="Afterlife archive assistant" className="flex min-h-[430px] w-full flex-col overflow-hidden rounded-[14px] bg-surface shadow-card">
      <div className="shrink-0 border-b border-line px-4 py-3">
        <div><h2 className="text-[14px] font-semibold text-ink">Ask Afterlife</h2><p className="mt-0.5 text-[12px] text-ink-2">Find projects, change lenses, or draft an introduction.</p></div>
      </div>
      <div ref={listRef} className="flex max-h-[480px] min-h-[180px] flex-1 flex-col gap-4 overflow-y-auto px-4 py-4" role="log" aria-live="polite" aria-busy={busy}>
        {!visibleMessages.length ? <div className="m-auto flex w-full max-w-2xl flex-col items-center py-6 text-center"><p className="text-xl font-medium leading-snug tracking-[-0.02em] text-ink sm:text-2xl">The archive remembers what people built.</p><p className="mt-3 max-w-xl text-[14px] leading-relaxed text-ink-2">Ask a question and I’ll find the evidence, highlight the projects, and help you reach the people behind them.</p><div className="mt-6 flex flex-wrap justify-center gap-2">{prompts.map((prompt) => <button type="button" key={prompt} disabled={busy} onClick={() => void send(prompt)} className="rounded-[6px] bg-field px-3 py-2 text-center text-[12px] text-ink transition-colors duration-100 hover:bg-hover-2">{prompt}</button>)}</div></div> : null}
        {visibleMessages.map((message) => message.role === "user" ? <div key={message.id} className="flex justify-end pl-10"><div className="max-w-[90%] rounded-xl bg-field px-3 py-2 text-[13px] leading-relaxed text-ink transition-[opacity,transform] duration-300">{String(message.content)}</div></div> : <div key={message.id} className="flex w-full flex-col gap-1.5"><span className="text-[12px] font-medium text-ink-2">Afterlife</span><p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{linkedText(String(message.content))}</p></div>)}
        {busy ? <p role="status" className="text-[13px] text-ink-2">Searching the archive and checking the evidence…</p> : null}
      </div>
      {visibleSources.length ? <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2">{visibleSources.map((source, index) => <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer" className="max-w-full truncate text-[11px] text-ink-2 underline underline-offset-4">{source.label || "Source evidence"}</a>)}</div> : null}
      {notice ? <p role="status" className="px-4 py-2 text-[12px] text-ink-2">{notice}</p> : null}
      <div className="mt-auto shrink-0 p-2">
        <form onSubmit={(event) => { event.preventDefault(); void send(draft); }} onClick={() => inputRef.current?.focus()} className="flex cursor-text items-center gap-3 rounded-control border border-line bg-field p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.035)] transition-[border-color,box-shadow] duration-150 focus-within:border-line-strong">
          <label htmlFor="archive-chat-input" className="sr-only">Ask the archive</label>
          <input id="archive-chat-input" ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1000} placeholder="Has anyone built something like my idea?" className="min-h-8 min-w-0 flex-1 bg-transparent text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-2" />
          {busy ? <button type="button" onClick={() => { cancelled.current = true; fallbackRequest.current?.abort(); void copilotkit.stopAgent({ agent }); setNotice("Response stopped."); }} className="rounded-[8px] bg-ink px-3 py-2 text-[12px] text-surface">Stop</button> : <button type="submit" aria-label="Send message" disabled={!draft.trim()} className="flex size-8 shrink-0 items-center justify-center rounded-[8px] transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.96] disabled:opacity-40" style={{ background: "var(--ink)", color: "var(--surface)" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg></button>}
        </form>
      </div>
    </section>
  );
}

export default function ArchiveChat() {
  return <AfterlifeCopilotProvider><ChatContent /></AfterlifeCopilotProvider>;
}
