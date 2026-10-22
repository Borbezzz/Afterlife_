import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { Project } from "@/lib/data";
import type { IndexingStatus } from "@/lib/contracts";

type CogneeConfig = { baseUrl: string; apiKey: string; dataset: string; datasetId?: string; timeoutMs: number };
export type CogneeSearchStatus = "used" | "not_configured" | "unavailable" | "no_matches";
export type CogneeSearch = { projectIds: string[]; status: CogneeSearchStatus; message: string; indexing?: IndexingStatus };
export type CogneeHealth = { configured: boolean; status: "ready" | "not_configured" | "unavailable" | "dataset_missing"; message: string; indexing?: IndexingStatus };

const MAX_RESPONSE_BYTES = 2_000_000;
const progressCache = new Map<string, { expires: number; promise: Promise<IndexingStatus> }>();

class CogneeError extends Error {}

function configuration(): CogneeConfig | null {
  const apiKey = process.env.COGNEE_API_KEY?.trim();
  const rawUrl = (process.env.COGNEE_API_URL || process.env.COGNEE_BASE_URL)?.trim();
  if (!apiKey || !rawUrl) return null;
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new CogneeError("Cognee configuration is invalid."); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(loopback && url.protocol === "http:")) || url.username || url.password || url.search || url.hash) {
    throw new CogneeError("Cognee requires a secure API URL without embedded credentials.");
  }
  const configuredTimeout = Number(process.env.COGNEE_TIMEOUT_MS);
  return {
    baseUrl: url.toString().replace(/\/+$/, "").replace(/\/api\/v1$/, ""), apiKey,
    dataset: process.env.COGNEE_DATASET?.trim() || "afterlife",
    datasetId: process.env.COGNEE_DATASET_ID?.trim() || undefined,
    timeoutMs: Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? Math.min(30_000, Math.max(1_000, configuredTimeout)) : 12_000,
  };
}

// Never surface upstream bodies, URLs, or exception messages: all can contain secrets.
function safeFailure(error: unknown) {
  return error instanceof CogneeError ? error.message : "Cognee is unavailable; archive retrieval is being used.";
}

async function request(config: CogneeConfig, endpoint: string, body?: Record<string, unknown>): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}${endpoint}`, {
      method: body ? "POST" : "GET", cache: "no-store", redirect: "error", signal: controller.signal,
      headers: { "X-Api-Key": config.apiKey, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new CogneeError(`Cognee request failed (HTTP ${response.status}).`);
    const reader = response.body?.getReader();
    if (!reader) throw new CogneeError("Cognee returned an unreadable response.");
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new CogneeError("Cognee response exceeded the safe size limit."); }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new CogneeError("Cognee returned an invalid response."); }
  } catch (error) {
    if (controller.signal.aborted) throw new CogneeError("Cognee timed out; archive retrieval is being used.");
    throw new CogneeError(safeFailure(error));
  } finally { clearTimeout(timer); }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function scopedDatasetId(payload: unknown, config: CogneeConfig, searchResponse = false) {
  if (!Array.isArray(payload)) return undefined;
  const entry = payload.map(record).find((item) => config.datasetId
    ? item?.[searchResponse ? "dataset_id" : "id"] === config.datasetId
    : item?.[searchResponse ? "dataset_name" : "name"] === config.dataset);
  const id = entry?.[searchResponse ? "dataset_id" : "id"];
  return typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id) ? id : undefined;
}

async function indexingProgress(config: CogneeConfig, knownId?: string): Promise<IndexingStatus> {
  // Memory-only, bounded cache. A credential rotation cannot reuse another
  // principal's status; neither credentials nor this fingerprint leave memory.
  const key = createHash("sha256").update(JSON.stringify([config.baseUrl, config.apiKey, config.dataset, config.datasetId])).digest("hex");
  const cached = progressCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = (async (): Promise<IndexingStatus> => {
    try {
      const id = config.datasetId || knownId || scopedDatasetId(await request(config, "/api/v1/datasets/"), config);
      if (!id) return { state: "unknown" };
      // Always scope by one resolved dataset; never request tenant-wide status.
      const payload = record(await request(config, `/api/v1/datasets/status/progress?dataset=${encodeURIComponent(id)}`));
      const item = record(payload?.[id]);
      const states: Record<string, IndexingStatus["state"]> = {
        DATASET_PROCESSING_INITIATED: "processing", DATASET_PROCESSING_STARTED: "processing",
        DATASET_PROCESSING_COMPLETED: "complete", DATASET_PROCESSING_ERRORED: "failed",
      };
      const state = typeof item?.status === "string" && Object.hasOwn(states, item.status) ? states[item.status] : "unknown";
      const progress = record(item?.progress);
      const completed = progress?.completed_items; const total = progress?.total_items;
      const validCounts = typeof completed === "number" && Number.isSafeInteger(completed) && completed >= 0
        && typeof total === "number" && Number.isSafeInteger(total) && total > 0 && completed <= total;
      return { state, ...(state === "processing" && validCounts ? { completed, total } : {}) };
    } catch { return { state: "unknown" }; } // Older tenants need not support progress.
  })();
  if (progressCache.size >= 8) progressCache.delete(progressCache.keys().next().value!);
  progressCache.set(key, { expires: Date.now() + 30_000, promise });
  return promise;
}

function indexingMessage(indexing: IndexingStatus) {
  if (indexing.state === "processing") {
    const counts = indexing.completed !== undefined && indexing.total !== undefined ? ` (${indexing.completed}/${indexing.total} records processed)` : "";
    return ` Cognee archive indexing is still in progress${counts}; results may be incomplete.`;
  }
  if (indexing.state === "failed") return " Cognee archive indexing encountered an error; results may be incomplete.";
  return "";
}

function canonicalUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
  } catch { return null; }
}

/** Only context/objects/evidence from verbose retrieval are eligible. Prompt and
 * completion fields may contain the query or session history and are not evidence. */
export function resolveCogneeProjects(payload: unknown, projects: Project[], scope: { dataset: string; datasetId?: string }): string[] {
  const byId = new Map(projects.map((project) => [project.id, project.id]));
  const byUrl = new Map(projects.flatMap((project) => { const url = canonicalUrl(project.url); return url ? [[url, project.id] as const] : []; }));
  const found = new Set<string>();
  let visited = 0;
  const inspect = (value: unknown, depth = 0) => {
    if (depth > 20 || ++visited > 30_000) return;
    if (typeof value === "string") {
      // Exact, explicit references only; titles, person names and fuzzy substrings
      // cannot establish the identity of an archive record.
      if (byId.has(value)) found.add(value);
      for (const match of value.matchAll(/(?:^|[^a-z0-9_:/-])(devpost:[a-z0-9][a-z0-9_-]*)(?![a-z0-9_-])/gi)) {
        const id = byId.get(match[1]); if (id) found.add(id);
      }
      for (const match of value.matchAll(/https?:\/\/[^\s<>"'\\]+/g)) {
        const normalized = canonicalUrl(match[0].replace(/[),.;\]}]+$/, ""));
        const id = normalized ? byUrl.get(normalized) : undefined;
        if (id) found.add(id);
      }
    } else if (Array.isArray(value)) value.forEach((item) => inspect(item, depth + 1));
    else {
      const object = record(value);
      if (object) for (const [key, child] of Object.entries(object)) {
        if (!/prompt|query|history|session|completion|text_result|search_result/i.test(key)) inspect(child, depth + 1);
      }
    }
  };
  if (!Array.isArray(payload)) throw new CogneeError("Cognee returned an unsupported response.");
  for (const entry of payload) {
    const item = record(entry);
    if (!item) continue;
    // A tenant may contain unrelated datasets. Missing scope also fails closed.
    const sameDataset = scope.datasetId ? item.dataset_id === scope.datasetId : item.dataset_name === scope.dataset;
    if (!sameDataset || item.error) continue;
    for (const field of ["context_result", "objects_result", "evidence"]) inspect(item[field]);
  }
  return [...found];
}

export async function searchCognee(query: string, projects: Project[], limit = 12): Promise<CogneeSearch> {
  try {
    const config = configuration();
    if (!config) return { projectIds: [], status: "not_configured", message: "Cognee is not configured; archive retrieval is being used." };
    const payload = await request(config, "/api/v1/search", {
      searchType: "GRAPH_COMPLETION", query: query.slice(0, 1000),
      ...(config.datasetId ? { datasetIds: [config.datasetId] } : { datasets: [config.dataset] }),
      // Verbose graph results repeat full chunks in context, objects and prompt.
      // Bound graph edges independently of the requested people/project count.
      topK: Math.max(25, Math.min(40, limit * 3)), onlyContext: true, includeReferences: true, verbose: true,
      sessionId: `afterlife-${randomUUID()}`,
    });
    const projectIds = resolveCogneeProjects(payload, projects, config).slice(0, limit);
    const indexing = await indexingProgress(config, scopedDatasetId(payload, config, true));
    const progressMessage = indexingMessage(indexing);
    return projectIds.length
      ? { projectIds, status: "used", indexing, message: "Cognee retrieved references to visible archive projects. Relationship claims require supporting archive evidence." + progressMessage }
      : { projectIds, status: "no_matches", indexing, message: "Cognee returned no verifiable references for these visible archive projects; archive retrieval is being used." + progressMessage };
  } catch (error) { return { projectIds: [], status: "unavailable", message: safeFailure(error) }; }
}

/** Checks authenticated dataset access, not graph completeness or search quality. */
export async function cogneeStatus(): Promise<CogneeHealth> {
  try {
    const config = configuration();
    if (!config) return { configured: false, status: "not_configured", message: "Cognee is not configured." };
    const payload = await request(config, "/api/v1/datasets/");
    if (!Array.isArray(payload)) throw new CogneeError("Cognee returned an unsupported dataset response.");
    const present = payload.some((value) => { const item = record(value); return config.datasetId ? item?.id === config.datasetId : item?.name === config.dataset; });
    if (!present) return { configured: true, status: "dataset_missing", message: "The configured archive dataset is not available in Cognee." };
    const indexing = await indexingProgress(config, scopedDatasetId(payload, config));
    const readiness = indexing.state === "complete" ? " Archive indexing is complete." : indexing.state === "unknown" ? " Indexing progress is unavailable; graph readiness is checked when searching." : indexingMessage(indexing);
    return { configured: true, status: "ready", indexing, message: "Cognee authentication and archive dataset access verified." + readiness };
  } catch (error) { return { configured: true, status: "unavailable", message: safeFailure(error) }; }
}
