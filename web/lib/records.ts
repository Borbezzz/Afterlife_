import type { AgentRun, Project } from "./data";

/** Ingestion may be interrupted halfway through its last JSONL record. */
export function parseAgentRuns(raw: string): AgentRun[] {
  return raw.split("\n").flatMap<AgentRun>((line, index) => {
    if (!line.trim()) return [];
    let run: Partial<AgentRun>;
    try { run = JSON.parse(line); } catch { return []; }
    if (!run || typeof run !== "object" || Array.isArray(run)) return [];
    return [{
      id: typeof run.id === "number" || typeof run.id === "string" ? run.id : `local-${index}`,
      kind: typeof run.kind === "string" ? run.kind : "unknown",
      status: run.status === "ok" || run.status === "partial" ? run.status : "failed",
      input: run.input ?? null, output: run.output ?? null,
      error: typeof run.error === "string" ? run.error : null,
      created_at: typeof run.created_at === "string" ? run.created_at : "",
    }];
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function findProject<T extends Pick<Project, "id" | "slug">>(projects: T[], idOrSlug: string): T | null {
  const exact = projects.find((p) => p.id === idOrSlug || p.slug === idOrSlug);
  if (exact) return exact;
  let key: string;
  try { key = decodeURIComponent(idOrSlug); } catch { return null; }
  return projects.find((p) => p.id === key || p.slug === key) ?? null;
}
