"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { projectHref } from "@/lib/routes";
import { searchProjects, type DirectoryProject } from "@/lib/search";
import { safeExternalUrl } from "@/lib/urls";

type Mode = "explore" | "ideas" | "speakers" | "intros";
const fieldClass = "w-full rounded-md border bg-background px-3 py-2 text-sm";

export function ProjectDirectory({ projects, mode = "explore", initialProject = "", initialPerson = "" }: { projects: DirectoryProject[]; mode?: Mode; initialProject?: string; initialPerson?: string }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState(projects.find((p) => p.slug === initialProject)?.id ?? "");
  const [reason, setReason] = useState("");
  const [copied, setCopied] = useState("");
  const matches = useMemo(() => searchProjects(projects, query).filter((p) => status === "all" || p.liveness === status), [projects, query, status]);
  const selected = matches.find((p) => p.id === selectedId);
  const recipient = selected?.team.find((person) => person.id === initialPerson) ?? selected?.team[0];
  const draft = selected ? `Hi ${recipient?.name ?? recipient?.devpost_username ?? "there"},\n\nI came across ${selected.title}${selected.tagline ? ` — ${selected.tagline}` : ""}. ${reason.trim() || "I'd love to learn about your experience building it."}\n\n${selected.built_with.length ? `I noticed the project uses ${selected.built_with.join(", ")}.\n\n` : ""}Project evidence: ${safeExternalUrl(selected.url) ?? "See the project detail page"}\n\nWould you be open to a short conversation?` : "";
  const speakers = useMemo(() => {
    const people = new Map<string, { name: string; projects: DirectoryProject[] }>();
    for (const project of matches) for (const person of project.team) {
      const entry = people.get(person.id) ?? { name: person.name ?? person.devpost_username ?? "Unnamed builder", projects: [] };
      entry.projects.push(project);
      people.set(person.id, entry);
    }
    return [...people.entries()];
  }, [matches]);

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
      <label className="space-y-1 text-sm font-medium">{mode === "speakers" ? "Topic or technology" : mode === "ideas" ? "Idea or keywords" : "Search projects and builders"}
        <input className={fieldClass} type="search" value={query} onChange={(event) => { setQuery(event.target.value); setCopied(""); }} placeholder="e.g. voice agents, climate, React" />
      </label>
      <label className="space-y-1 text-sm font-medium">Project activity
        <select className={fieldClass} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All activity</option>{["alive", "dormant", "dead", "unknown"].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
    </div>
    <p className="text-sm text-muted-foreground" role="status">{mode === "speakers" ? `${speakers.length} builders with matching project evidence` : `${matches.length} matching projects`}. Results use keyword matches in public project records.</p>
    {!projects.length ? <p>No projects are available yet. Try again after data has been imported.</p> : !matches.length ? <p>No matches. Try fewer keywords or choose all activity.</p> : mode === "speakers" ? <>
      <p className="text-sm text-muted-foreground">These are research candidates. Speaking experience, availability and consent have not been verified.</p>
      {!speakers.length ? <p>No visible builders are attached to these projects. Try another topic.</p> : <ul className="grid gap-3 sm:grid-cols-2">{speakers.map(([id, person]) => <li key={id} className="min-w-0 rounded-lg border p-4">
        <h2 className="font-semibold">{person.name}</h2>
        <ul className="mt-2 space-y-2 text-sm">{person.projects.map((project) => <li key={project.id}><Link className="underline" href={projectHref(project)}>{project.title}</Link>{project.is_winner ? " · Prize winner" : ""}{project.gh_stars !== null ? ` · ${project.gh_stars} GitHub stars` : ""}<p className="text-muted-foreground">{project.tagline}</p></li>)}</ul>
      </li>)}</ul>}
    </> : <>
      {mode === "intros" && selected && <section className="space-y-3 rounded-lg border p-4" aria-label="Introduction draft">
        <h2 className="font-semibold">Draft about {selected.title}</h2>
        <label className="block space-y-1 text-sm">Why you want to connect<input className={fieldClass} value={reason} onChange={(event) => { setReason(event.target.value); setCopied(""); }} /></label>
        <label className="block space-y-1 text-sm">Draft to review<textarea className={`${fieldClass} min-h-64`} value={draft} readOnly /></label>
        <button className="rounded border px-3 py-2 text-sm" type="button" onClick={async () => { try { await navigator.clipboard.writeText(draft); setCopied("Copied draft."); } catch { setCopied("Copy is unavailable. Select and copy the draft text above."); } }}>Copy draft</button>
        <p className="text-sm" role="status">{copied}</p>
        <p className="text-xs text-muted-foreground">This template stays in this page and has not been sent or saved. Confirm the recipient and evidence before using it.</p>
      </section>}
      <ul className="grid gap-3 sm:grid-cols-2">{matches.map((project) => <li key={project.id} className="min-w-0 space-y-2 rounded-lg border p-4">
        <h2 className="font-semibold"><Link className="underline underline-offset-4" href={projectHref(project)}>{project.title}</Link></h2>
        <p className="text-sm text-muted-foreground">{project.tagline ?? "No summary available."}</p>
        <p className="text-xs">Activity: {project.liveness}{project.is_winner ? " · Prize winner" : ""}</p>
        {project.built_with.length > 0 && <p className="break-words text-xs text-muted-foreground">{project.built_with.join(" · ")}</p>}
        {mode === "intros" && <button type="button" className="rounded border px-3 py-1 text-sm" aria-pressed={selected?.id === project.id} onClick={() => { setSelectedId(project.id); setCopied(""); }}>Draft intro about {project.title}</button>}
      </li>)}</ul>
    </>}
  </div>;
}
