import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { cacheLife } from "next/cache";

import type { Project } from "@/lib/data";
import type { ClassifiedImpact } from "@/lib/map-classification";

export interface AxisDimension {
  id: string;
  label: string;
  lowLabel: string;
  highLabel: string;
}

export interface ProjectAxisScores {
  commercial: number;
  deeptech: number;
  traction: number;
  ai: number;
  climate: number;
  health: number;
  fintech: number;
  devtools: number;
  consumer: number;
  [key: string]: number;
}

export interface ProjectAxis {
  id: string;
  scores: ProjectAxisScores;
  rationale: string;
  confidence: number;
  impact?: ClassifiedImpact & { model: string; rubricVersion: string };
}

export interface AxisSnapshot {
  model: string;
  generatedAt: string | null;
  dimensions: AxisDimension[];
  byProject: Record<string, ProjectAxis>;
  fallback: boolean;
}

interface AxisFile {
  model?: string;
  generated_at?: string;
  dimensions?: AxisDimension[];
  projects?: ProjectAxis[];
}

export const DEFAULT_DIMENSIONS: AxisDimension[] = [
  { id: "commercial", label: "Commercial intent", lowLabel: "Non-profit", highLabel: "Commercial" },
  { id: "deeptech", label: "Deep technology", lowLabel: "Applied software", highLabel: "Deep tech" },
  { id: "traction", label: "Public momentum", lowLabel: "Limited evidence", highLabel: "Active development" },
  { id: "ai", label: "AI & agents", lowLabel: "Low affinity", highLabel: "High affinity" },
  { id: "climate", label: "Climate", lowLabel: "Low affinity", highLabel: "High affinity" },
  { id: "health", label: "Health", lowLabel: "Low affinity", highLabel: "High affinity" },
  { id: "fintech", label: "Finance", lowLabel: "Low affinity", highLabel: "High affinity" },
  { id: "devtools", label: "Developer tools", lowLabel: "Low affinity", highLabel: "High affinity" },
  { id: "consumer", label: "Consumer", lowLabel: "Low affinity", highLabel: "High affinity" },
];

const AXES_PATH = path.join(process.cwd(), "..", "data", "project-axes.json");
const IMPACT_PATH = path.join(process.cwd(), "..", "data", "project-impact.json");
const IMPACT_DIMENSIONS: AxisDimension[] = [
  { id: "socialPotential", label: "Social impact potential", lowLabel: "Unknown / limited evidence", highLabel: "Strong supported potential" },
  { id: "demonstratedImpact", label: "Demonstrated impact", lowLabel: "No supplied outcome evidence", highLabel: "Independently verified outcomes" },
];
const scoreKeys = DEFAULT_DIMENSIONS.map((dimension) => dimension.id);

function clamp(value: unknown, min = 0, max = 1): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(max, Math.max(min, parsed));
}

function matchingScore(project: Project, terms: string[]): number {
  const content = [project.title, project.tagline, project.description, ...project.domains, ...project.built_with]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return terms.some((term) => term.length <= 2
    ? new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(content)
    : content.includes(term)) ? 0.7 : 0.12;
}

function fallbackAxis(project: Project): ProjectAxis {
  const traction = Math.min(1, Math.max(0, project.gh_commits_after_event ?? 0) / 40);
  const content = [project.title, project.tagline, project.description, ...project.domains, ...project.built_with]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const commercialTerms = ["b2b", "business model", "sales", "customer", "commerce", "marketplace", "saas", "subscription", "revenue", "monetiz", "pricing", "enterprise"];
  const nonprofitTerms = ["nonprofit", "non-profit", "charity", "charitable", "volunteer", "donation", "social good", "public benefit"];
  const commercial = commercialTerms.some((term) => content.includes(term))
    ? 0.7
    : nonprofitTerms.some((term) => content.includes(term)) ? -0.7 : 0;
  return {
    id: project.id,
    scores: {
      commercial,
      deeptech: matchingScore(project, ["hardware", "robot", "robotics", "ar", "vr", "computer vision", "machine learning", "infrastructure"]),
      traction,
      ai: matchingScore(project, ["ai", "llm", "agent", "model", "gpt", "machine learning"]),
      climate: matchingScore(project, ["climate", "carbon", "energy", "sustainab", "green"]),
      health: matchingScore(project, ["health", "medical", "wellness", "care", "patient"]),
      fintech: matchingScore(project, ["fintech", "finance", "payment", "bank", "crypto"]),
      devtools: matchingScore(project, ["developer", "devtool", "api", "code", "github", "sdk"]),
      consumer: matchingScore(project, ["consumer", "social", "creator", "community", "game", "music"]),
    },
    rationale: "Local fallback based on public project metadata; enrichment has not run for this project.",
    confidence: 0.2,
  };
}

function normaliseAxis(entry: ProjectAxis): ProjectAxis {
  const scores = Object.fromEntries(
    [...new Set([...scoreKeys, ...Object.keys(entry.scores ?? {})])].map((key) => [
      key,
      key === "commercial" ? clamp(entry.scores?.[key], -1, 1) : clamp(entry.scores?.[key]),
    ]),
  ) as ProjectAxisScores;
  return {
    id: entry.id,
    scores,
    rationale: entry.rationale || "No axis rationale was supplied.",
    confidence: clamp(entry.confidence),
  };
}

/**
 * Read the optional generated axis file and guarantee every visible project has
 * a coordinate. The fallback is deliberately marked so estimates are never
 * presented as model evidence.
 */
export async function getAxesSnapshot(projects: Project[]): Promise<AxisSnapshot> {
  "use cache";
  cacheLife("minutes");
  let file: AxisFile | null = null;
  let impactFile: { model: string; rubric_version: string; projects: Array<ClassifiedImpact & { id: string; input_hash: string }> } | null = null;
  try {
    file = JSON.parse(await readFile(AXES_PATH, "utf8")) as AxisFile;
  } catch {
    // The app is usable before the offline enrichment job has produced a file.
  }
  try {
    impactFile = JSON.parse(await readFile(IMPACT_PATH, "utf8"));
  } catch { /* Impact lenses appear once their evidence extraction is available. */ }
  const impactById = new Map((impactFile?.projects ?? []).map((entry) => [entry.id, entry]));

  const source = new Map((file?.projects ?? []).filter((item) => item?.id).map((item) => [item.id, normaliseAxis(item)]));
  const byProject: Record<string, ProjectAxis> = {};
  let usedFallback = !file;
  for (const project of projects) {
    const axis = source.get(project.id) ?? source.get(project.slug);
    byProject[project.id] = axis ?? fallbackAxis(project);
    const impact = impactById.get(project.id);
    const sourceHash = createHash("sha256").update(JSON.stringify({ id: project.id, title: project.title || "", tagline: project.tagline || "", description: (project.description || "").slice(0, 4500) })).digest("hex");
    if (impact && impact.input_hash === sourceHash) {
      byProject[project.id] = {
        ...byProject[project.id],
        scores: { ...byProject[project.id].scores, socialPotential: impact.socialPotential.score ?? 0, demonstratedImpact: impact.demonstratedImpact.score },
        impact: { socialPotential: impact.socialPotential, demonstratedImpact: impact.demonstratedImpact, model: impactFile!.model, rubricVersion: impactFile!.rubric_version },
      };
    }
    usedFallback ||= !axis;
  }

  const suppliedDimensions = (file?.dimensions ?? []).filter(
    (dimension): dimension is AxisDimension => Boolean(dimension?.id && dimension.label && dimension.lowLabel && dimension.highLabel),
  );
  const baseDimensions = suppliedDimensions.length
    ? [...DEFAULT_DIMENSIONS.filter((defaultDimension) => !suppliedDimensions.some((dimension) => dimension.id === defaultDimension.id)), ...suppliedDimensions]
    : DEFAULT_DIMENSIONS;
  const dimensions = impactFile ? [...IMPACT_DIMENSIONS, ...baseDimensions] : baseDimensions;

  return {
    model: file?.model || "Local metadata fallback",
    generatedAt: file?.generated_at ?? null,
    dimensions,
    byProject,
    fallback: usedFallback,
  };
}
