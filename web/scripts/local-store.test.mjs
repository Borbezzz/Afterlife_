import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("local-store preserves concurrent writes and updates in an isolated data directory", async () => {
  const originalCwd = process.cwd();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "afterlife-local-store-"));
  const tempWeb = path.join(tempRoot, "web");
  await mkdir(tempWeb, { recursive: true });

  try {
    process.chdir(tempWeb);
    const source = await readFile(path.join(projectRoot, "lib/local-store.ts"), "utf8");
    const executableSource = source.replace(/^import ["']server-only["'];\s*$/m, "");
    const { outputText, diagnostics } = ts.transpileModule(executableSource, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      reportDiagnostics: true,
    });
    assert.deepEqual(diagnostics ?? [], [], "local-store.ts should transpile cleanly");
    const modulePath = path.join(tempRoot, "local-store.mjs");
    await writeFile(modulePath, outputText, "utf8");
    const store = await import(pathToFileURL(modulePath));

    const count = 32;
    await Promise.all(Array.from({ length: count }, (_, index) => store.saveLocalProfile({
      personId: `person-${index}`,
      buildingNow: `build-${index}`,
      wantToMeet: "",
      openToSpeaking: false,
      hidden: false,
      consent: true,
      updated_at: new Date().toISOString(),
    })));
    const profiles = await store.getLocalProfiles();
    assert.equal(profiles.length, count);
    assert.deepEqual(new Set(profiles.map((profile) => profile.personId)), new Set(Array.from({ length: count }, (_, index) => `person-${index}`)));

    const savedDrafts = await Promise.all(Array.from({ length: count }, (_, index) => store.saveLocalIntro({
      id: `intro-${index}`,
      status: "draft",
      created_at: new Date().toISOString(),
      subject: `subject-${index}`,
      body: `body-${index}`,
      evidence: [],
      mode: "local",
      projectId: `project-${index}`,
      personName: `person-${index}`,
    })));
    assert.equal((await store.getLocalIntros()).length, count);
    const updated = await store.updateLocalIntro(savedDrafts[0].id, { subject: "revised subject", body: "revised body" });
    assert.equal(updated.subject, "revised subject");
    assert.equal(updated.body, "revised body");
    assert.equal(await store.updateLocalIntro("missing", { subject: "x", body: "y" }), null);
    assert.deepEqual(
      (await store.getLocalIntros()).find((draft) => draft.id === savedDrafts[0].id),
      updated,
      "intro updates should persist",
    );

    await Promise.all(Array.from({ length: count }, (_, index) => store.logLocalRun({
      kind: "test.concurrent",
      status: "ok",
      input: { index },
      output: null,
      error: null,
    })));
    const runs = await store.getLocalRuns(count + 1);
    assert.equal(runs.length, count);
    assert.equal(new Set(runs.map((run) => run.id)).size, count);
  } finally {
    process.chdir(originalCwd);
    await rm(tempRoot, { recursive: true, force: true });
  }
});
