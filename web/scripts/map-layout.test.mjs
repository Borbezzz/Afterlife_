import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(webRoot, "lib/map-layout.ts"), "utf8");
const { outputText, diagnostics } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.deepEqual(diagnostics ?? [], []);
const modulePath = path.join(os.tmpdir(), `afterlife-map-layout-${process.pid}.mjs`);
await writeFile(modulePath, outputText, "utf8");
const { buildMapPositions, makeMapOffsets, mapCoordinate, MAP_OFFSET_LIMIT, MAP_POSITION_RADIUS, MAP_MIN_NODE_DISTANCE } = await import(pathToFileURL(modulePath));
const axes = JSON.parse(await readFile(path.join(webRoot, "..", "data", "project-axes.json"), "utf8"));
const impact = JSON.parse(await readFile(path.join(webRoot, "..", "data", "project-impact.json"), "utf8"));
const impactById = new Map(impact.projects.map((project) => [project.id, project]));
const projectsWithImpact = axes.projects.map((project) => {
  const ratings = impactById.get(project.id);
  return { id: project.id, scores: {
    ...project.scores,
    socialPotential: ratings?.socialPotential?.score ?? 0,
    demonstratedImpact: ratings?.demonstratedImpact?.score ?? 0,
  } };
});
const ids = axes.projects.map((project) => project.id);
const dimensions = axes.dimensions.map((dimension) => dimension.id);

test("catalog offsets stay stable through filtering, reordering, and axis swaps", () => {
  const full = makeMapOffsets(ids, dimensions);
  const filteredIds = new Set(ids.slice(20, 80).reverse());
  const projectById = new Map(axes.projects.map((project) => [project.id, project]));
  const renderPosition = (project, selection) => selection.map((dimension) => mapCoordinate(project.scores[dimension] ?? 0, dimension) + full.get(project.id)[dimension]);
  const initialPositions = new Map(axes.projects.map((project) => [project.id, renderPosition(project, ["commercial", "deeptech", "traction"])]));
  for (const id of ids.filter((candidate) => filteredIds.has(candidate))) {
    assert.deepEqual(renderPosition(projectById.get(id), ["commercial", "deeptech", "traction"]), initialPositions.get(id));
  }
  assert.deepEqual(makeMapOffsets([...ids].reverse(), dimensions), full);

  const project = axes.projects[10];
  const position = (selection) => renderPosition(project, selection);
  assert.deepEqual(position(["deeptech", "commercial", "traction"]), [position(["commercial", "deeptech", "traction"])[1], position(["commercial", "deeptech", "traction"])[0], position(["commercial", "deeptech", "traction"])[2]]);
});

test("display coordinates are bounded and separate every current default triple", () => {
  const offsets = makeMapOffsets(ids, dimensions);
  for (const id of ids) for (const value of Object.values(offsets.get(id))) assert.ok(Math.abs(value) <= MAP_OFFSET_LIMIT);
  assert.equal(mapCoordinate(Number.NaN, "commercial"), 0);
  assert.equal(mapCoordinate(5, "commercial"), 115);
  assert.equal(mapCoordinate(-2, "traction"), -115);

  const selection = ["commercial", "deeptech", "traction"];
  const rendered = axes.projects.map((project) => selection.map((dimension) => mapCoordinate(project.scores[dimension] ?? 0, dimension) + offsets.get(project.id)[dimension]).join(","));
  assert.equal(ids.length, 300);
  assert.equal(new Set(rendered).size, ids.length);
});

test("3D positions spread the full catalog while staying near stable evidence anchors", () => {
  const selection = { x: "commercial", y: "deeptech", z: "traction" };
  const positions = buildMapPositions(axes.projects, selection);
  const reordered = buildMapPositions([...axes.projects].reverse(), selection);
  let nearest = Infinity;
  let maxOffset = 0;
  for (const project of axes.projects) {
    const point = positions.get(project.id);
    assert.deepEqual(reordered.get(project.id), point);
    assert.deepEqual(point.anchor, {
      x: mapCoordinate(project.scores.commercial ?? 0, "commercial"),
      y: mapCoordinate(project.scores.deeptech ?? 0, "deeptech"),
      z: mapCoordinate(project.scores.traction ?? 0, "traction"),
    });
    const offset = Math.hypot(point.offset.x, point.offset.y, point.offset.z);
    maxOffset = Math.max(maxOffset, offset);
    assert.ok(offset <= MAP_POSITION_RADIUS + 1e-8);
  }
  for (const [axis, dimension] of [selection.x, selection.y, selection.z].entries()) {
    const coordinate = (point) => [point.x, point.y, point.z][axis];
    const score = (project) => mapCoordinate(project.scores[dimension] ?? 0, dimension);
    for (let first = 0; first < axes.projects.length; first += 1) for (let second = first + 1; second < axes.projects.length; second += 1) {
      const sourceDifference = score(axes.projects[first]) - score(axes.projects[second]);
      if (sourceDifference !== 0) assert.ok(sourceDifference * (coordinate(positions.get(axes.projects[first].id)) - coordinate(positions.get(axes.projects[second].id))) > 0);
    }
  }
  for (let first = 0; first < ids.length; first += 1) for (let second = first + 1; second < ids.length; second += 1) {
    const a = positions.get(ids[first]); const b = positions.get(ids[second]);
    const distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    nearest = Math.min(nearest, distance);
  }
  assert.ok(nearest >= MAP_MIN_NODE_DISTANCE + 1, `minimum spacing was ${nearest.toFixed(3)}`);
  assert.ok(maxOffset <= MAP_POSITION_RADIUS);
  assert.equal(positions.size, ids.length);
});

test("impact defaults preserve evidence order and keep the full catalog clickable", () => {
  const selection = { x: "socialPotential", y: "deeptech", z: "demonstratedImpact" };
  const positions = buildMapPositions(projectsWithImpact, selection);
  let nearest = Infinity;
  let maxOffset = 0;
  for (const project of projectsWithImpact) {
    const point = positions.get(project.id);
    assert.deepEqual(point.anchor, {
      x: mapCoordinate(project.scores.socialPotential ?? 0, "socialPotential"),
      y: mapCoordinate(project.scores.deeptech ?? 0, "deeptech"),
      z: mapCoordinate(project.scores.demonstratedImpact ?? 0, "demonstratedImpact"),
    });
    maxOffset = Math.max(maxOffset, Math.hypot(point.offset.x, point.offset.y, point.offset.z));
  }
  for (const [axis, dimension] of [selection.x, selection.y, selection.z].entries()) {
    const coordinate = (point) => [point.x, point.y, point.z][axis];
    for (let first = 0; first < projectsWithImpact.length; first += 1) for (let second = first + 1; second < projectsWithImpact.length; second += 1) {
      const sourceDifference = mapCoordinate(projectsWithImpact[first].scores[dimension] ?? 0, dimension)
        - mapCoordinate(projectsWithImpact[second].scores[dimension] ?? 0, dimension);
      if (sourceDifference !== 0) assert.ok(sourceDifference * (coordinate(positions.get(projectsWithImpact[first].id)) - coordinate(positions.get(projectsWithImpact[second].id))) > 0);
    }
  }
  for (let first = 0; first < ids.length; first += 1) for (let second = first + 1; second < ids.length; second += 1) {
    const a = positions.get(ids[first]); const b = positions.get(ids[second]);
    nearest = Math.min(nearest, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
  }
  assert.ok(nearest >= MAP_MIN_NODE_DISTANCE + 1, `minimum impact-axis spacing was ${nearest.toFixed(3)}`);
  assert.ok(maxOffset <= MAP_POSITION_RADIUS);
});
