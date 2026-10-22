import { BuiltInAgent, CopilotRuntime, createCopilotRuntimeHandler, defineTool, InMemoryAgentRunner } from "@copilotkit/runtime/v2";
import { z } from "zod";
import { draftIntro, findSpeakersWithStatus, safeLog, searchProjects, searchProjectsWithStatus } from "@/lib/intelligence";
import { saveLocalIntro } from "@/lib/local-store";
import { assertLocalWorkspaceRequest } from "@/lib/local-access";

const projectResult = (result: Awaited<ReturnType<typeof searchProjects>>[number]) => ({
  project: { id: result.project.id, title: result.project.title, tagline: result.project.tagline, domains: result.project.domains, liveness: result.project.liveness, url: result.project.url, team: result.project.team.map((person) => ({ id: person.id, name: person.name, devpost_url: person.devpost_url })) },
  score: result.score,
  reasons: result.reasons,
  evidence: result.evidence,
  retrieval: result.retrieval,
});

const searchArchive = defineTool({
  name: "search_archive",
  description: "Search verified Afterlife project records. Use before answering any question about projects, domains, builders, technologies, winners, or liveness.",
  parameters: z.object({ query: z.string().min(1).max(500), limit: z.number().int().min(1).max(12).optional() }),
  execute: async ({ query, limit }) => {
    const { results, retrieval } = await searchProjectsWithStatus(query, limit ?? 8);
    await safeLog("copilot.search_archive", retrieval.status === "used" ? "ok" : "partial", { query, limit }, { count: results.length, retrieval });
    return { results: results.map(projectResult), retrieval, actions: { highlight: results.map((result) => result.project.id), focus: results[0]?.project.id } };
  },
});

const discoverSpeakers = defineTool({
  name: "discover_speakers",
  description: "Find real, visible people from archived project teams whose project evidence matches a topic. Only recommend people returned by this tool.",
  parameters: z.object({ topic: z.string().min(1).max(500), limit: z.number().int().min(1).max(12).optional() }),
  execute: async ({ topic, limit }) => {
    const { candidates, retrieval } = await findSpeakersWithStatus(topic, limit ?? 8);
    await safeLog("copilot.discover_speakers", retrieval.status === "used" ? "ok" : "partial", { topic, limit }, { count: candidates.length, retrieval });
    return { candidates: candidates.map((candidate) => ({ person: { id: candidate.person.id, name: candidate.person.name, devpost_url: candidate.person.devpost_url }, projects: candidate.projects.map((project) => ({ id: project.id, title: project.title, url: project.url })), reasons: candidate.reasons, evidence: candidate.evidence })), retrieval, actions: { highlight: candidates.flatMap((candidate) => candidate.projects.map((project) => project.id)) } };
  },
});

const createIntro = defineTool({
  name: "draft_introduction",
  description: "Create an evidence-linked introduction draft for one archived project. This only drafts text; it never sends a message.",
  parameters: z.object({ projectId: z.string().min(1).max(180), personId: z.string().max(180).optional(), intent: z.string().max(500).optional(), senderName: z.string().max(120).optional() }),
  execute: async ({ projectId, personId, intent, senderName }) => {
    const draft = await draftIntro(projectId, personId, intent, senderName);
    const saved = await saveLocalIntro({ id: crypto.randomUUID(), status: "draft", created_at: new Date().toISOString(), ...draft });
    await safeLog("copilot.draft_introduction", saved.mode === "openai" ? "ok" : "partial", { projectId, personId }, { id: saved.id });
    return { ...saved, actions: { highlight: [saved.projectId], focus: saved.projectId } };
  },
});

const setMapLenses = defineTool({
  name: "set_map_lenses",
  description: "Set the three map lenses for an investor or domain exploration. Use when the user asks to compare, reposition, or view projects through three specified dimensions.",
  parameters: z.object({ axes: z.array(z.enum(["commercial", "deeptech", "traction", "ai", "climate", "health", "fintech", "devtools", "consumer"])).length(3) }),
  execute: async ({ axes }) => { await safeLog("copilot.set_map_lenses", "ok", { axes }, { axes }); return { actions: { axes } }; },
});

const runtimeInstance = new CopilotRuntime({
  agents: {
    default: new BuiltInAgent({
      model: `openai/${process.env.OPENAI_RELATIONSHIP_MODEL || process.env.OPENAI_CHAT_MODEL || "gpt-6-astra"}`,
      maxSteps: 4,
      maxOutputTokens: 600,
      prompt: "You are Afterlife, an evidence-first research assistant for an archive of London hackathon projects. For factual questions about projects or people, call the appropriate archive tool before answering. Only state claims, names, URLs, activity, and project details returned by a tool. Cite the returned evidence URLs in plain text when useful. If a tool returns no result, say the archive has no matching verified record. Never invent contact details, funding, traction, credit availability, or integration status. An introduction is always a draft and is never sent. Respond in concise plain text with short paragraphs; do not use Markdown tables or emphasis syntax. Put source URLs on separate lines. If retrieval reports that the graph is still processing or failed, explain that matches may be incomplete.",
      tools: [searchArchive, discoverSpeakers, createIntro, setMapLenses],
    }),
  },
  runner: new InMemoryAgentRunner(),
});

const handler = createCopilotRuntimeHandler({ runtime: runtimeInstance, basePath: "/api/copilotkit" });
async function guardedHandler(request: Request) {
  try { assertLocalWorkspaceRequest(request); return handler(request); }
  catch (error) { return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Request failed" }), { status: 403, headers: { "Content-Type": "application/json" } }); }
}
export { guardedHandler as GET, guardedHandler as POST, guardedHandler as PATCH, guardedHandler as DELETE };
