import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(webRoot, "lib/map-classification.ts"), "utf8");
const { outputText, diagnostics } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.deepEqual(diagnostics ?? [], []);
const modulePath = path.join(os.tmpdir(), `afterlife-map-classification-${process.pid}.mjs`);
await writeFile(modulePath, outputText, "utf8");
const { classifyImpact } = await import(pathToFileURL(modulePath));

const sourceText = {
  title: "Open Door",
  tagline: "Accessible legal help for tenants",
  description: "We tested our prototype with five renters and helped them submit repair requests.",
};
const extraction = {
  socialPotential: { severity: 4, directness: 3, inclusion: 2, confidence: 0.9, summary: "Tenant protections address a serious need.", evidenceQuote: "Accessible legal help for tenants" },
  demonstratedImpact: { stage: 2, confidence: 0.8, summary: "A prototype was used by renters.", evidenceQuote: "tested our prototype with five renters" },
};

test("social potential uses fixed weights and scales into a bounded coordinate", () => {
  const result = classifyImpact(extraction, sourceText);
  assert.equal(result.socialPotential.score, 0.825);
  assert.equal(result.socialPotential.confidence, 0.9);
  assert.equal(result.demonstratedImpact.score, 0.5);
});

test("quotes must occur verbatim in supplied title, tagline, or description", () => {
  const result = classifyImpact({
    ...extraction,
    socialPotential: { ...extraction.socialPotential, evidenceQuote: "accessible tenant help" },
  }, sourceText);
  assert.equal(result.socialPotential.score, null);
  assert.equal(result.socialPotential.evidenceQuote, null);
  assert.equal(result.socialPotential.confidence, 0);
});

test("author supplied evidence cannot claim independent verification and needs external beneficiaries for stage two", () => {
  const result = classifyImpact({
    ...extraction,
    demonstratedImpact: { ...extraction.demonstratedImpact, stage: 4 },
  }, sourceText);
  assert.equal(result.demonstratedImpact.stage, 2);
  assert.equal(result.demonstratedImpact.score, 0.5);
});

test("team-only self reports cannot count as external outcomes", () => {
  const result = classifyImpact({
    ...extraction,
    demonstratedImpact: {
      stage: 3,
      confidence: 0.9,
      summary: "The team noticed new details.",
      evidenceQuote: "We ourselves noticed new details in famous art works.",
    },
  }, {
    title: "Livable Worlds",
    tagline: "Re-live art with narrated experiences.",
    description: "We ourselves noticed new details in famous art works.",
  });
  assert.equal(result.demonstratedImpact.stage, 0);
  assert.equal(result.demonstratedImpact.score, 0);
  assert.equal(result.demonstratedImpact.confidence, 0);
  assert.equal(result.demonstratedImpact.evidenceQuote, "We ourselves noticed new details in famous art works.");
  assert.match(result.demonstratedImpact.summary, /no external beneficiary outcome/i);
});

test("stage three requires an external beneficiary change, then caps at author-reported evidence", () => {
  const result = classifyImpact({
    ...extraction,
    demonstratedImpact: {
      stage: 4,
      confidence: 0.9,
      summary: "Renters report repairs improved.",
      evidenceQuote: "Renters reported repairs improved after using the service.",
    },
  }, { ...sourceText, description: "Renters reported repairs improved after using the service." });
  assert.equal(result.demonstratedImpact.stage, 3);
  assert.equal(result.demonstratedImpact.score, 0.75);
});

test("missing metadata remains unknown for potential and stage zero for outcomes", () => {
  const missing = {
    socialPotential: { severity: null, directness: null, inclusion: null, confidence: 0, summary: "", evidenceQuote: "" },
    demonstratedImpact: { stage: 0, confidence: 0.9, summary: "", evidenceQuote: "" },
  };
  const result = classifyImpact(missing, { title: "", tagline: "", description: "" });
  assert.equal(result.socialPotential.score, null);
  assert.equal(result.socialPotential.confidence, 0);
  assert.equal(result.demonstratedImpact.score, 0);
  assert.equal(result.demonstratedImpact.stage, 0);
  assert.equal(result.demonstratedImpact.confidence, 0);
});

test("classification is deterministic and missing factor weights are not renormalized", () => {
  const partial = {
    ...extraction,
    socialPotential: { ...extraction.socialPotential, directness: null, inclusion: null },
  };
  const result = classifyImpact(partial, sourceText);
  assert.equal(result.socialPotential.score, 0.5);
  assert.deepEqual(result, classifyImpact(partial, sourceText));
});
