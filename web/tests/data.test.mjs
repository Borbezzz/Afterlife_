import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadDataModule(tempRoot, client) {
  const tempWeb = path.join(tempRoot, "web");
  await mkdir(tempWeb, { recursive: true });
  const [dataSource, recordsSource] = await Promise.all([
    readFile(path.join(webRoot, "lib/data.ts"), "utf8"),
    readFile(path.join(webRoot, "lib/records.ts"), "utf8"),
  ]);
  const dataForTest = dataSource
    .replace(/^import "server-only";\n/m, "")
    .replace('from "./records"', 'from "./records.mjs"')
    .replace('from "next/cache"', 'from "./next-cache.mjs"')
    .replace('from "@supabase/supabase-js"', 'from "./supabase.mjs"');
  const transpile = (source) => ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  await Promise.all([
    writeFile(path.join(tempRoot, "data.mjs"), transpile(dataForTest)),
    writeFile(path.join(tempRoot, "records.mjs"), transpile(recordsSource)),
    writeFile(path.join(tempRoot, "next-cache.mjs"), "export const cacheLife = () => {};\n"),
    writeFile(path.join(tempRoot, "supabase.mjs"), "export const createClient = () => globalThis.__afterlifeClient;\n"),
  ]);
  globalThis.__afterlifeClient = client;
  const originalCwd = process.cwd();
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
  process.chdir(tempWeb);
  try {
    return await import(`${pathToFileURL(path.join(tempRoot, "data.mjs")).href}?${Date.now()}-${Math.random()}`);
  } finally {
    process.chdir(originalCwd);
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  }
}

test("Supabase snapshot reads every range page with a stable id tie-breaker", { concurrency: false }, async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "afterlife-data-pages-"));
  const ranges = [];
  const selections = [];
  const orders = [];
  const events = Array.from({ length: 1001 }, (_, index) => ({ id: `event-${index}`, title: `Event ${index}` }));
  const projects = Array.from({ length: 1001 }, (_, index) => ({
    id: `project-${index}`,
    slug: `project-${index}`,
    title: `Project ${index}`,
    project_members: index === 0 ? [
      { person: { id: "visible", hidden: false } },
      { person: { id: "hidden", hidden: true } },
    ] : [],
  }));
  const client = {
    from(table) {
      return {
        select(columns) {
          selections.push({ table, columns });
          const query = {
            order(column, options) {
              orders.push({ table, column, options });
              return query;
            },
            range(from, to) {
              ranges.push({ table, from, to });
              return Promise.resolve({ data: (table === "events" ? events : projects).slice(from, to + 1), error: null });
            },
          };
          return query;
        },
      };
    },
  };

  try {
    const data = await loadDataModule(tempRoot, client);
    const snapshot = await data.getSnapshot();
    assert.equal(snapshot.source, "supabase");
    assert.equal(snapshot.events.length, 1001);
    assert.equal(snapshot.projects.length, 1001);
    assert.deepEqual(snapshot.projects[0].team.map((person) => person.id), ["visible"]);
    assert.equal(selections.find((selection) => selection.table === "projects").columns.includes("project_members(person:people("), true);
    assert.deepEqual(ranges, [
      { table: "events", from: 0, to: 499 },
      { table: "projects", from: 0, to: 499 },
      { table: "events", from: 500, to: 999 },
      { table: "projects", from: 500, to: 999 },
      { table: "events", from: 1000, to: 1499 },
      { table: "projects", from: 1000, to: 1499 },
    ]);
    assert.equal(orders.every(({ column, options }, index) => index % 2 === 0
      ? options.ascending === false
      : column === "id" && options.ascending === true), true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("agent-run query failures use strict local JSONL parsing and a capped limit", { concurrency: false }, async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "afterlife-agent-runs-"));
  const dataDir = path.join(tempRoot, "data");
  await mkdir(dataDir, { recursive: true });
  await writeFile(path.join(dataDir, "agent_runs.jsonl"), [
    '{"kind":"valid","status":"ok","created_at":"2026-10-22"}',
    '{"kind":{},"status":"unknown","created_at":12}',
    '{"kind":',
  ].join("\n"));
  let requestedLimit;
  const client = {
    from() {
      return {
        select() {
          return {
            order() {
              return {
                limit(limit) {
                  requestedLimit = limit;
                  return Promise.reject(new Error("network unavailable"));
                },
              };
            },
          };
        },
      };
    },
  };

  try {
    const data = await loadDataModule(tempRoot, client);
    const warn = console.warn;
    let runs;
    try {
      console.warn = () => {};
      runs = await data.getAgentRuns(5001);
    } finally {
      console.warn = warn;
    }
    assert.equal(requestedLimit, 1000);
    assert.deepEqual(runs.map((run) => run.kind), ["valid", "unknown"]);
    assert.equal(runs[1].status, "failed");
    assert.deepEqual(await data.getAgentRuns(-1), []);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
