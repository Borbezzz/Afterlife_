import { localWorkspaceDenied } from "@/lib/local-access";
import { NextResponse } from "next/server";
import { body, jsonError, searchWarning } from "@/lib/intelligence/http";
import { limitValue, narrate, safeLog, searchProjectsWithStatus, validateText } from "@/lib/intelligence";
function searchFilters(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("filters must be an object");
  const filters = value as Record<string, unknown>;
  if (Object.keys(filters).some((key) => key !== "domains" && key !== "liveness")) throw new Error("filters contains an unsupported field");
  if (filters.domains !== undefined && (!Array.isArray(filters.domains) || filters.domains.length > 20 || filters.domains.some((domain) => typeof domain !== "string" || domain.trim().length > 100))) {
    throw new Error("filters.domains must be an array of up to 20 strings of at most 100 characters");
  }
  if (filters.liveness !== undefined && (typeof filters.liveness !== "string" || !["alive", "dormant", "dead", "unknown"].includes(filters.liveness))) {
    throw new Error("filters.liveness must be alive, dormant, dead, or unknown");
  }
  return filters;
}

export async function POST(request: Request) {
  const denied = localWorkspaceDenied(request); if (denied) return denied;
  try {
    const input = await body(request);
    const query = validateText(input.query, "query", 500);
    const { results, retrieval } = await searchProjectsWithStatus(query, limitValue(input.limit), searchFilters(input.filters));
    const narration = await narrate(query, results);
    const warning = searchWarning(retrieval, narration.mode);
    await safeLog("agent.search", warning ? "partial" : "ok", { query }, { count: results.length, mode: narration.mode, retrieval });
    return NextResponse.json({ query, results, summary: narration.text, mode: narration.mode, retrieval, ...(warning ? { warning } : {}) });
  } catch (error) {
    await safeLog("agent.search", "failed", null, null, error instanceof Error ? error.message : "Request failed");
    return jsonError(error);
  }
}
