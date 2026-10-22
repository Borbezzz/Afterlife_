import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cacheLife } from "next/cache";

import { createProjectBrief, projectBriefSource, readGeneratedBrief, type BriefProject, type ProjectBrief } from "@/lib/project-brief";

type BriefEntry = { id: string; sourceHash: string; summary: string; highlights: string[]; evidenceQuotes: string[] };

/** Rewrites are prepared offline; node selection never waits for a model. */
export async function getProjectBriefs(projects: BriefProject[]): Promise<Record<string, ProjectBrief>> {
  "use cache";
  cacheLife("minutes");
  let entries: BriefEntry[] = [];
  try {
    const file = JSON.parse(await readFile(path.join(process.cwd(), "..", "data", "project-briefs.json"), "utf8"));
    if (file.version === 1 && Array.isArray(file.projects)) entries = file.projects;
  } catch { /* New or changed projects still get a source-based brief. */ }
  const byId = new Map(entries.filter((entry) => entry && typeof entry.id === "string").map((entry) => [entry.id, entry]));
  return Object.fromEntries(projects.map((project) => {
    const entry = byId.get(project.id);
    const sourceHash = createHash("sha256").update(projectBriefSource(project)).digest("hex");
    const brief = entry?.sourceHash === sourceHash ? readGeneratedBrief(entry, project) : null;
    return [project.id, brief ?? createProjectBrief(project)];
  }));
}
