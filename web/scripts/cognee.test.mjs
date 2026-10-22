import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import ts from "typescript";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const originalCwd = process.cwd();
const originalFetch = globalThis.fetch;
const envNames = ["COGNEE_API_URL", "COGNEE_BASE_URL", "COGNEE_API_KEY", "COGNEE_DATASET", "COGNEE_DATASET_ID", "COGNEE_TIMEOUT_MS", "OPENAI_API_KEY", "OPENAI_CHAT_MODEL", "OPENAI_RELATIONSHIP_MODEL"];
const originalEnv = Object.fromEntries(envNames.map((key) => [key, process.env[key]]));
let root, cognee, intelligence, fixtures;

function reset() {
  for (const key of envNames) delete process.env[key];
  globalThis.fetch = originalFetch;
  fixtures.state.projects = [];
  fixtures.state.profiles = [];
  fixtures.state.logs = [];
}
function configured() {
  process.env.COGNEE_API_URL = "https://cognee.example.test";
  process.env.COGNEE_API_KEY = "never-output-this-key";
  process.env.COGNEE_DATASET = "afterlife";
}
function project(slug, changes = {}) {
  return { id: `devpost:${slug}`, slug, title: slug, tagline: "", description: "Climate research", url: `https://devpost.com/software/${slug}`, domains: ["climate"], built_with: [], prizes: [], github_repo: null, likes: 0, is_winner: false, liveness: "alive", team: [], ...changes };
}
function person(id, changes = {}) {
  return { id, name: "Visible Builder", devpost_username: "visible-builder", devpost_url: "https://devpost.com/visible-builder", hidden: false, ...changes };
}
function context(text, changes = {}) { return { dataset_name: "afterlife", dataset_id: "archive-dataset", context_result: text, ...changes }; }
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

before(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "afterlife-cognee-"));
  await mkdir(path.join(root, "web"));
  process.chdir(path.join(root, "web"));
  await writeFile(path.join(root, "fixtures.mjs"), `export const state={projects:[],profiles:[],logs:[]}; export async function getProjects(){return state.projects}; export async function getLocalProfiles(){return state.profiles}; export async function logLocalRun(value){state.logs.push(value)}; export async function getAxesSnapshot(){return {byProject:{}}};`);
  for (const name of ["records", "cognee", "visibility", "intelligence"]) {
    let source = (await readFile(path.join(webRoot, `lib/${name}.ts`), "utf8")).replace(/^import ["']server-only["'];\s*$/m, "");
    source = source.replaceAll('"@/lib/data"', '"./fixtures.mjs"').replaceAll('"@/lib/axes"', '"./fixtures.mjs"').replaceAll('"@/lib/local-store"', '"./fixtures.mjs"').replaceAll('"@/lib/visibility"', '"./visibility.mjs"').replaceAll('"@/lib/cognee"', '"./cognee.mjs"').replaceAll('"@/lib/records"', '"./records.mjs"');
    const { outputText, diagnostics } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
    assert.deepEqual(diagnostics ?? [], []);
    await writeFile(path.join(root, `${name}.mjs`), outputText);
  }
  fixtures = await import(pathToFileURL(path.join(root, "fixtures.mjs")));
  cognee = await import(pathToFileURL(path.join(root, "cognee.mjs")));
  intelligence = await import(pathToFileURL(path.join(root, "intelligence.mjs")));
});

after(async () => {
  globalThis.fetch = originalFetch;
  process.chdir(originalCwd);
  for (const key of envNames) {
    if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key];
  }
  await rm(root, { recursive: true, force: true });
});

test("resolves only explicit scoped retrieved references, never prompts, unknown projects or fuzzy names", () => {
  reset();
  const projects = [project("alpha"), project("beta"), project("echo"), project("other")];
  const payload = [context("Canonical reference devpost:alpha and https://devpost.com/software/beta.", {
    objects_result: [{ id: "devpost:alpha" }, { name: "echo" }],
    evidence: [{ url: "https://devpost.com/software/beta", query: "devpost:echo" }],
    user_prompt_result: "Question: devpost:echo", system_prompt_result: "devpost:echo", text_result: "devpost:echo", search_result: "devpost:echo",
  }), context("devpost:other", { dataset_name: "private", dataset_id: "private-dataset" }), { context_result: "devpost:other" }];
  assert.deepEqual(cognee.resolveCogneeProjects(payload, projects, { dataset: "afterlife" }), ["devpost:alpha", "devpost:beta"]);
  assert.deepEqual(cognee.resolveCogneeProjects([context("devpost:alpha-extra https://evil.test/software/beta echo")], projects, { dataset: "afterlife" }), []);
  assert.deepEqual(cognee.resolveCogneeProjects(payload, projects, { dataset: "afterlife", datasetId: "wrong-id" }), []);
  assert.deepEqual(cognee.resolveCogneeProjects(payload, projects, { dataset: "ignored-name", datasetId: "archive-dataset" }), ["devpost:alpha", "devpost:beta"]);
});

test("uses tenant camelCase search schema, explicit scope, bounded requests and authenticated dataset health", async () => {
  reset(); configured();
  globalThis.fetch = async (url, init) => {
    assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store"); assert.ok(init.signal);
    assert.equal(init.headers["X-Api-Key"], "never-output-this-key");
    if (init.method === "GET") { assert.equal(url, "https://cognee.example.test/api/v1/datasets/"); return json([{ name: "afterlife" }]); }
    assert.equal(url, "https://cognee.example.test/api/v1/search");
    const body = JSON.parse(init.body);
    assert.equal(body.searchType, "GRAPH_COMPLETION"); assert.equal(body.onlyContext, true); assert.equal(body.verbose, true); assert.equal(body.includeReferences, true);
    assert.deepEqual(body.datasets, ["afterlife"]); assert.match(body.sessionId, /^afterlife-/);
    return json([context("devpost:alpha")]);
  };
  assert.equal((await cognee.cogneeStatus()).status, "ready");
  const found = await cognee.searchCognee("related builders", [project("alpha")]);
  assert.deepEqual(found.projectIds, ["devpost:alpha"]); assert.equal(found.status, "used");
  assert.ok(!JSON.stringify(found).includes("never-output"));
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body); assert.equal(body.topK, 40, "speaker-sized queries must not request unbounded verbose chunks");
    return json([context("devpost:alpha")]);
  };
  assert.equal((await cognee.searchCognee("related builders", [project("alpha")], 100)).status, "used");
});

test("reports missing configuration, missing dataset, malformed JSON and HTTP failures safely", async () => {
  reset();
  globalThis.fetch = async () => { throw new Error("must not fetch"); };
  assert.equal((await cognee.searchCognee("q", [])).status, "not_configured");
  assert.equal((await cognee.cogneeStatus()).configured, false);
  configured();
  globalThis.fetch = async () => json([{ name: "private_dataset" }]);
  assert.equal((await cognee.cogneeStatus()).status, "dataset_missing");
  for (const mock of [async () => json({ error: "never-output-this-key private-person" }, 503), async () => new Response("never-output-this-key"), async () => { throw new Error("never-output-this-key"); }]) {
    globalThis.fetch = mock;
    const result = await cognee.searchCognee("q", []);
    assert.equal(result.status, "unavailable"); assert.deepEqual(result.projectIds, []);
    assert.ok(!JSON.stringify(result).includes("never-output")); assert.ok(!JSON.stringify(result).includes("private-person"));
  }
});

test("aborts timed-out calls and rejects oversized responses", async () => {
  reset(); configured(); process.env.COGNEE_TIMEOUT_MS = "1";
  globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("never-output-this-key")), { once: true }));
  const start = Date.now();
  const timeout = await cognee.searchCognee("q", []);
  assert.equal(timeout.status, "unavailable"); assert.match(timeout.message, /timed out/); assert.ok(Date.now() - start < 2500);
  globalThis.fetch = async () => new Response('"' + "x".repeat(2_000_001) + '"');
  const oversized = await cognee.searchCognee("q", []);
  assert.equal(oversized.status, "unavailable"); assert.match(oversized.message, /size limit/);
});

test("does not follow redirects with credentials", async () => {
  reset(); configured();
  let redirectedRequests = 0;
  const server = createServer((req, res) => {
    if (req.url === "/redirect-target") { redirectedRequests += 1; res.writeHead(200); res.end("[]"); }
    else { res.writeHead(307, { Location: "/redirect-target" }); res.end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    process.env.COGNEE_API_URL = `http://127.0.0.1:${server.address().port}`;
    const result = await cognee.searchCognee("q", []);
    assert.equal(result.status, "unavailable"); assert.equal(redirectedRequests, 0);
  } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

test("shared search resolves graph matches through privacy and filters without exposing upstream prose", async () => {
  reset(); configured();
  fixtures.state.projects = [project("alpha", { team: [person("visible")] }), project("hidden", { team: [person("hidden")] }), project("private", { team: [person("private", { hidden: true })] }), project("health", { domains: ["health"] })];
  fixtures.state.profiles = [{ personId: "hidden", hidden: true }];
  globalThis.fetch = async () => json([context("devpost:alpha devpost:hidden devpost:private devpost:health SECRET_EXTERNAL_TEXT Funding $9bn")]);
  const outcome = await intelligence.searchProjectsWithStatus("investor relationships", 12, { domains: ["climate"], liveness: "alive" });
  assert.equal(outcome.retrieval.provider, "cognee"); assert.equal(outcome.retrieval.status, "used");
  assert.deepEqual(outcome.results.map((result) => result.project.id), ["devpost:alpha"]);
  assert.deepEqual(outcome.results[0].evidence, [{ source: "Afterlife project record", label: "alpha", url: "https://devpost.com/software/alpha" }]);
  assert.match(outcome.results[0].reasons[0], /not independently verified/);
  assert.doesNotMatch(JSON.stringify(outcome), /SECRET_EXTERNAL_TEXT|Funding|9bn|devpost:hidden|devpost:private/);
  assert.deepEqual((await intelligence.searchProjects("investor relationships", 12, { domains: ["climate"] })).map((result) => result.project.id), ["devpost:alpha"]);
});

test("successful request with only prompt echoes or unrelated datasets falls back honestly, including zero results", async () => {
  reset(); configured(); fixtures.state.projects = [project("alpha")];
  globalThis.fetch = async () => json([context([], { user_prompt_result: "devpost:alpha", search_result: "devpost:alpha" }), context("devpost:alpha", { dataset_name: "private" })]);
  const fallback = await intelligence.searchProjectsWithStatus("climate");
  assert.equal(fallback.retrieval.provider, "local"); assert.equal(fallback.retrieval.status, "no_matches"); assert.equal(fallback.results.length, 1);
  const empty = await intelligence.searchProjectsWithStatus("unmatchedword");
  assert.deepEqual(empty.results, []); assert.equal(empty.retrieval.status, "no_matches");
  globalThis.fetch = async () => json({ message: "never-output-this-key" }, 401);
  const failed = await intelligence.searchProjectsWithStatus("climate");
  assert.equal(failed.retrieval.provider, "local"); assert.equal(failed.retrieval.status, "unavailable"); assert.equal(failed.results.length, 1);
});

test("speaker discovery shares graph retrieval and keeps hidden or opted-out speakers excluded", async () => {
  reset(); configured();
  fixtures.state.projects = [project("alpha", { team: [person("visible"), person("opted-out")] }), project("hidden", { team: [person("hidden")] })];
  fixtures.state.profiles = [{ personId: "hidden", hidden: true }, { personId: "opted-out", openToSpeaking: false }];
  globalThis.fetch = async () => json([context("devpost:alpha devpost:hidden")]);
  const outcome = await intelligence.findSpeakersWithStatus("climate");
  assert.equal(outcome.retrieval.provider, "cognee");
  assert.deepEqual(outcome.candidates.map((candidate) => candidate.person.id), ["visible"]);
  assert.equal(outcome.candidates[0].retrieval.provider, "cognee");
});

test("Astra narration receives canonical evidence and public team identities, independent of retrieval status", async () => {
  reset(); configured(); process.env.OPENAI_API_KEY = "test-openai-key";
  fixtures.state.projects = [project("alpha", { team: [person("visible")] })];
  let narrationCalls = 0;
  globalThis.fetch = async (url, init) => {
    if (url.includes("cognee.example")) return json([context("devpost:alpha PRIVATE_UPSTREAM_PROSE")]);
    assert.equal(url, "https://api.openai.com/v1/responses"); narrationCalls += 1;
    const body = JSON.parse(init.body); assert.equal(body.model, "gpt-6-astra"); assert.equal(body.store, false);
    assert.equal(init.redirect, "error"); assert.ok(init.signal);
    const input = JSON.parse(body.input);
    assert.equal(input.evidence[0].team[0].name, "Visible Builder");
    assert.doesNotMatch(body.input, /PRIVATE_UPSTREAM_PROSE/); assert.match(body.instructions, /Do not use Markdown/); assert.match(body.instructions, /Never infer investors/);
    return json({ output_text: "Visible Builder contributed to alpha. Source: https://devpost.com/software/alpha" });
  };
  const results = await intelligence.searchProjects("climate");
  assert.equal(narrationCalls, 0, "graph search should not add per-result LLM calls");
  assert.equal((await intelligence.narrate("climate", results, "speaker discovery")).mode, "openai");
  assert.equal(narrationCalls, 1);
  delete process.env.OPENAI_API_KEY;
  const localNarration = await intelligence.narrate("climate", results);
  assert.equal(localNarration.mode, "local"); assert.equal(results[0].retrieval.provider, "cognee");
});

test("embedding fallback orders by meaning over a single title keyword and keeps provenance honest", async () => {
  reset(); process.env.OPENAI_API_KEY = "test-openai-key";
  fixtures.state.projects = [project("bot", { title: "Bot" }), project("event-messenger", { description: "WhatsApp event organization" })];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/embeddings");
    const body = JSON.parse(init.body);
    return json({ data: body.input.map((_value, index) => ({ index, embedding: body.input.length === 1 ? [1, 0] : index === 0 ? [0.6, 0.8] : [0.95, 0.31225] })) });
  };
  const result = await intelligence.searchProjectsWithStatus("WhatsApp event bot");
  assert.equal(result.retrieval.provider, "embeddings"); assert.equal(result.retrieval.status, "not_configured");
  assert.equal(result.results[0].project.id, "devpost:event-messenger");
  assert.match(result.results[0].reasons[0], /Adjacent match/);
});

test("health and working search expose scoped processing counts and reuse progress for 30 seconds", async () => {
  reset(); configured();
  const id = "11111111-1111-4111-8111-111111111111";
  process.env.COGNEE_DATASET_ID = id;
  fixtures.state.projects = [project("alpha")];
  let progressCalls = 0;
  let upstreamState = "DATASET_PROCESSING_STARTED";
  globalThis.fetch = async (url, init) => {
    assert.equal(init.headers["X-Api-Key"], "never-output-this-key"); assert.equal(init.redirect, "error"); assert.ok(init.signal);
    if (url.endsWith("/api/v1/datasets/")) return json([{ name: "afterlife", id }]);
    if (url.includes("/status/progress")) {
      assert.equal(new URL(url).searchParams.get("dataset"), id); progressCalls += 1;
      return json({ [id]: { status: upstreamState, progress: { completed_items: 135, total_items: 300, current_stage: "SECRET_STAGE" }, error: "SECRET_ERROR" }, otherDataset: { status: "DATASET_PROCESSING_ERRORED", progress: { completed_items: 1, total_items: 999 } } });
    }
    return json([context("devpost:alpha", { dataset_id: id })]);
  };
  const health = await cognee.cogneeStatus();
  assert.equal(health.status, "ready"); assert.deepEqual(health.indexing, { state: "processing", completed: 135, total: 300 });
  assert.match(health.message, /135\/300/); assert.match(health.message, /may be incomplete/);
  const result = await intelligence.searchProjectsWithStatus("climate");
  assert.equal(result.retrieval.provider, "cognee"); assert.equal(result.retrieval.status, "used");
  assert.deepEqual(result.retrieval.indexing, health.indexing); assert.equal(result.results.length, 1); assert.equal(progressCalls, 1);
  assert.doesNotMatch(JSON.stringify({ health, result }), /SECRET_|otherDataset|999|never-output/);
  upstreamState = "DATASET_PROCESSING_COMPLETED";
  const now = Date.now;
  Date.now = () => now() + 31_000;
  try {
    const complete = await cognee.cogneeStatus();
    assert.equal(complete.status, "ready"); assert.deepEqual(complete.indexing, { state: "complete" });
    assert.match(complete.message, /indexing is complete/); assert.doesNotMatch(complete.message, /incomplete/); assert.equal(progressCalls, 2);
  } finally { Date.now = now; }
});

test("progress resolves configured dataset name, normalizes failure, and does not trust raw status or counts", async () => {
  reset(); configured(); process.env.COGNEE_API_URL = "https://progress-name.example.test";
  const id = "22222222-2222-4222-8222-222222222222";
  let upstreamState = "DATASET_PROCESSING_ERRORED";
  globalThis.fetch = async (url) => {
    if (url.endsWith("/api/v1/datasets/")) return json([{ id, name: "afterlife" }, { id: "unrelated", name: "private" }]);
    if (url.includes("/status/progress")) {
      assert.equal(new URL(url).searchParams.get("dataset"), id);
      return json({ [id]: { status: upstreamState, progress: { completed_items: -3, total_items: "PRIVATE_DATA", current_stage: "SECRET_STAGE" }, error: "SECRET_ERROR" } });
    }
    return json([context("devpost:alpha", { dataset_id: id })]);
  };
  const failed = await cognee.cogneeStatus();
  assert.equal(failed.status, "ready"); assert.deepEqual(failed.indexing, { state: "failed" });
  assert.match(failed.message, /may be incomplete/);
  const result = await cognee.searchCognee("climate", [project("alpha")]);
  assert.equal(result.status, "used"); assert.equal(result.indexing.state, "failed");
  assert.doesNotMatch(JSON.stringify(result), /SECRET_|PRIVATE_DATA/);
  // A rotated credential must not reuse the previous principal's cached status.
  process.env.COGNEE_API_KEY = "different-test-credential"; upstreamState = "__proto__";
  assert.deepEqual((await cognee.cogneeStatus()).indexing, { state: "unknown" });
});

test("unsupported progress endpoints remain nonfatal and cache unknown readiness", async () => {
  reset(); configured();
  const id = "33333333-3333-4333-8333-333333333333";
  process.env.COGNEE_DATASET_ID = id;
  let progressCalls = 0;
  globalThis.fetch = async (url) => {
    if (url.endsWith("/api/v1/datasets/")) return json([{ id, name: "afterlife" }]);
    if (url.includes("/status/progress")) { progressCalls += 1; return json({ error: "SECRET_UPSTREAM_ERROR" }, 404); }
    return json([context("devpost:alpha", { dataset_id: id })]);
  };
  const health = await cognee.cogneeStatus();
  assert.equal(health.status, "ready"); assert.deepEqual(health.indexing, { state: "unknown" });
  const result = await cognee.searchCognee("climate", [project("alpha")]);
  assert.equal(result.status, "used"); assert.deepEqual(result.indexing, { state: "unknown" }); assert.equal(progressCalls, 1);
  assert.doesNotMatch(JSON.stringify({ health, result }), /SECRET_|incomplete/);
});

test("introduction lookup handles encoded identifiers and malformed percent input without selecting another project", async () => {
  reset();
  fixtures.state.projects = [project("foo/bar"), project("foo%2Fbar")];
  const draft = await intelligence.draftIntro("foo%2Fbar");
  assert.equal(draft.projectId, "devpost:foo%2Fbar");
  await assert.rejects(intelligence.draftIntro("%broken"), /Project not found/);
});
