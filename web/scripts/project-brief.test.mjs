import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(webRoot, "lib/project-brief.ts"), "utf8");
const { outputText, diagnostics } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
assert.deepEqual(diagnostics ?? [], []);
const modulePath = path.join(os.tmpdir(), `afterlife-project-brief-${process.pid}.mjs`);
await writeFile(modulePath, outputText, "utf8");
const { createProjectBrief, parseProjectDescription, projectBriefPassages, projectBriefSource, readGeneratedBrief } = await import(pathToFileURL(modulePath));
const archive = JSON.parse(await readFile(path.join(webRoot, "..", "data", "projects.json"), "utf8"));
const noDrama = archive.projects.find((project) => project.id === "devpost:no-drama-news");
const usaid = archive.projects.find((project) => project.id === "devpost:usaid-mit125");

test("parses authored Devpost headings and makes NoDrama News scannable", () => {
  const sections = parseProjectDescription(noDrama.description);
  assert.equal(sections.find((section) => section.title === "What it does")?.text.includes("Fact-checks claims"), true);
  const brief = createProjectBrief(noDrama);
  assert.match(brief.summary, /allows users to paste a news link or search a topic/i);
  assert.ok(brief.highlights.some((item) => /Fact-checks claims/i.test(item)));
  assert.ok(brief.highlights.length <= 3);
  assert.ok(brief.summary.split(/\s+/).length <= 32);
  assert.ok(brief.highlights.every((item) => item.split(/\s+/).length <= 18));
});

test("skips standalone title lines before the actual USAID product sentence", () => {
  const brief = createProjectBrief(usaid);
  assert.match(brief.summary, /^Usaid is an AI-powered engine/i);
  assert.notEqual(brief.summary, "Usaid");
  assert.ok(brief.summary.split(/\s+/).length >= 3);
});

test("accepts markdown heading variants and leaves source prose intact", () => {
  const description = "# Inspiration\nA problem.\n\n## What it does\nUses Node.js 20.1 to analyze updates.\n- Shows the result.\n\n## What's next for Sample\nWill add alerts.";
  const sections = parseProjectDescription(description);
  assert.deepEqual(sections.map((section) => section.title), ["Inspiration", "What it does", "What's next"]);
  assert.equal(sections[1].text, "Uses Node.js 20.1 to analyze updates.\n- Shows the result.");
  const brief = createProjectBrief({ id: "sample", title: "Sample", tagline: "A slogan", description });
  assert.match(brief.summary, /Node\.js 20\.1/);
  assert.ok(!brief.highlights.some((item) => /Will add alerts/i.test(item)));
});

test("does not mistake ordinary prose for a heading and keeps curly apostrophe next sections", () => {
  const description = "Inspiration for teams starts with a small question.\n\nWhat it does\nShows a simple plan.\n\nWhat’s next for Sample\nWill add alerts.";
  const sections = parseProjectDescription(description);
  assert.deepEqual(sections.map((section) => section.title), [null, "What it does", "What's next"]);
  assert.match(sections[0].text, /Inspiration for teams/);
});

test("has a usable source-faithful fallback for missing and prose-only records", () => {
  assert.deepEqual(createProjectBrief({ id: "empty", title: "Empty", tagline: null, description: null }), { summary: "No public project description was captured.", highlights: [] });
  for (const id of ["devpost:hacka-vymnld", "devpost:save-dora"]) {
    assert.equal(createProjectBrief(archive.projects.find((project) => project.id === id)).summary, "No public project description was captured.");
  }
  const brief = createProjectBrief({ id: "prose", title: "Prose", tagline: "Ignore this slogan", description: "A tool helps teams plan projects. It keeps work visible. It sends reminders." });
  assert.match(brief.summary, /helps teams plan projects/i);
  assert.equal(brief.highlights.length, 2);
  assert.match(projectBriefSource(noDrama), /devpost:no-drama-news/);
  const futureOnly = createProjectBrief({ id: "future", title: "Future", tagline: "A small prototype", description: "What's next\nWill add alerts and integrations." });
  assert.deepEqual(futureOnly, { summary: "A small prototype", highlights: [] });
  const qualified = createProjectBrief({ id: "qualified", title: "Qualified", tagline: null, description: "What it does\nThis is a deliberately very long description with many ordinary words that does not make claims beyond the evidence supplied and does not promise any outcomes validation customers adoption reliability or future performance at all." });
  assert.equal(qualified.summary, "Qualified is a project with public notes in the archive.");
});

test("only accepts concise generated copy backed by exact source quotes", () => {
  const valid = { summary: "NoDrama News analyzes a link or topic.", highlights: ["It fact-checks claims across multiple sources."], evidenceQuotes: ["paste a news link or search a topic", "Fact-checks claims across multiple sources"] };
  assert.deepEqual(readGeneratedBrief(valid, noDrama), { summary: valid.summary, highlights: valid.highlights });
  assert.equal(readGeneratedBrief({ ...valid, evidenceQuotes: ["invented", valid.evidenceQuotes[1]] }, noDrama), null);
  assert.equal(readGeneratedBrief({ ...valid, highlights: ["one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen"] }, noDrama), null);
  assert.equal(readGeneratedBrief({ ...valid, evidenceQuotes: [valid.evidenceQuotes[0]] }, noDrama), null);
  const multiline = { id: "multiline", title: "Multiline", tagline: null, description: "A source line\nwith an exact quote." };
  const multilineCandidate = { summary: "A concise summary.", highlights: [], evidenceQuotes: ["source line\nwith an exact"] };
  assert.deepEqual(readGeneratedBrief(multilineCandidate, multiline), { summary: multilineCandidate.summary, highlights: [] });
  assert.equal(readGeneratedBrief({ ...multilineCandidate, evidenceQuotes: ["source line with an exact"] }, multiline), null);
});

test("generated copy can cite only relevant product passages", () => {
  const project = { id: "scope", title: "Scope", tagline: "A small planning assistant", description: "Inspiration\nA planning assistant for every person.\n\nWhat it does\nTurns a project outline into an ordered checklist.\nShows owners and due dates." };
  assert.ok(projectBriefPassages(project).includes("Turns a project outline into an ordered checklist."));
  assert.ok(projectBriefPassages(project).includes("Shows owners and due dates."));
  assert.ok(!projectBriefPassages(project).some((passage) => passage.includes("every person")));
  const direct = { summary: "Scope makes a checklist.", highlights: [], evidenceQuotes: ["Turns a project outline into an ordered checklist"] };
  assert.deepEqual(readGeneratedBrief(direct, project), { summary: direct.summary, highlights: [] });
  assert.equal(readGeneratedBrief({ ...direct, evidenceQuotes: ["A planning assistant for every person"] }, project), null);
  assert.equal(readGeneratedBrief({ ...direct, evidenceQuotes: ["Scope"] }, project), null);
  assert.equal(readGeneratedBrief({ ...direct, evidenceQuotes: ["project outline"] }, project), null);
  const namedAfterPhrase = { ...project, title: "Turns a project outline" };
  assert.equal(readGeneratedBrief({ ...direct, evidenceQuotes: [namedAfterPhrase.title] }, namedAfterPhrase), null);
});
