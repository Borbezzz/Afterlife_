"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ExternalLink, Focus, List, Map as MapIcon, Maximize2, Minimize2, RotateCcw, Search, X } from "lucide-react";
import * as THREE from "three";

import { Badge } from "@/components/reui/badge";
import { ProjectDescription } from "@/components/projects/project-description";
import type { ProjectBrief } from "@/lib/project-brief";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AxisDimension, AxisSnapshot } from "@/lib/axes";
import type { Liveness } from "@/lib/data";
import { buildMapPositions } from "@/lib/map-layout";
import { projectHref } from "@/lib/routes";
import { githubRepositoryUrl, safeExternalUrl as safeHref } from "@/lib/urls";
import { cn } from "cn";

export interface MapProject {
  id: string; slug: string; title: string; tagline: string | null; description: string | null;
  brief?: ProjectBrief;
  liveness: Liveness; livenessReason: string | null; likes: number; githubStars: number | null;
  domains: string[]; inferredDomains: boolean; builtWith: string[]; event: { id: string; title: string } | null;
  url: string; githubRepo: string | null; links: string[];
  team: Array<{ id: string; name: string | null; devpostUrl: string | null; githubLogin: string | null }>;
}

type GraphNode = MapProject & { x: number; y: number; z: number; fx: number; fy: number; fz: number; size: number; axisScores: Record<string, number>; anchor: { x: number; y: number; z: number } };
type AxisSelection = { x: string; y: string; z: string };
type GraphAPI = { scene(): THREE.Scene; camera(): THREE.Camera; cameraPosition(position: { x: number; y: number; z: number }, lookAt?: { x: number; y: number; z: number }, duration?: number): unknown };

const ForceGraph3D = dynamic(() => import("@/components/explore/graph-canvas"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted-foreground">Loading the map…</div>,
});
const LIVENESS_COLOR: Record<Liveness, string> = { alive: "#15966d", dormant: "#bd7a18", dead: "#9a9a94", unknown: "#637079" };

function statusLabel(status: Liveness) { return status === "unknown" ? "Unverified" : status[0].toUpperCase() + status.slice(1); }
function escapeMapLabel(value: string) {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

function projectDomainTerms(project: MapProject, axes: AxisSnapshot) {
  if (project.domains.length) return project.domains;
  return axes.dimensions.filter((dimension) => ["ai", "climate", "health", "fintech", "devtools", "consumer"].includes(dimension.id) && (axes.byProject[project.id]?.scores[dimension.id] ?? 0) >= 0.65).map((dimension) => dimension.label);
}
function projectMatches(project: MapProject, axes: AxisSnapshot, search: string, status: string, event: string, domain: string) {
  const inferredDomains = projectDomainTerms(project, axes);
  const haystack = [project.title, project.tagline, project.description, ...inferredDomains, ...project.builtWith, project.event?.title].filter(Boolean).join(" ").toLowerCase();
  return (!search || haystack.includes(search.toLowerCase())) && (status === "all" || project.liveness === status) && (event === "all" || project.event?.id === event) && (domain === "all" || inferredDomains.includes(domain));
}

function makeAxisLabel(text: string, position: THREE.Vector3, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 640; canvas.height = 100;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.Object3D();
  context.font = "600 30px system-ui, sans-serif";
  context.fillStyle = color;
  context.textAlign = "center";
  context.fillText(text, canvas.width / 2, 56, 610);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false, sizeAttenuation: false }));
  sprite.position.copy(position); sprite.scale.set(0.35, 0.0547, 1);
  return sprite;
}

function addSceneAxes(scene: THREE.Scene, dimensions: AxisDimension[], selection: AxisSelection) {
  const dimension = (id: string) => dimensions.find((item) => item.id === id) ?? { id, label: id, lowLabel: "Low", highLabel: "High" };
  const chosen = [dimension(selection.x), dimension(selection.y), dimension(selection.z)];
  const group = new THREE.Group(); group.name = "afterlife-axis-guides";
  const half = 115;
  const origin = new THREE.Vector3(-half, -half, -half);
  const box = new THREE.BoxGeometry(half * 2, half * 2, half * 2);
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: 0x8c979f, transparent: true, opacity: 0.35 })));
  box.dispose();
  const points: THREE.Vector3[] = [];
  for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) for (let tick = 1; tick < 5; tick += 1) {
    const value = -half + tick * (2 * half / 5);
    for (const [fixed, running] of [[a, b], [b, a]]) {
      const start = origin.clone().setComponent(fixed, value);
      points.push(start.clone().setComponent(running, -half), start.clone().setComponent(running, half));
    }
  }
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x9aa7ae, transparent: true, opacity: 0.14, depthWrite: false })));
  const directions = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  const colors = [0xdc4b45, 0x248653, 0x386fcb];
  const cssColors = ["#a23e32", "#17674f", "#285c91"];
  chosen.forEach((item, index) => {
    const direction = directions[index];
    const end = origin.clone().addScaledVector(direction, 2 * half);
    group.add(new THREE.ArrowHelper(direction, origin, 2 * half, colors[index], 7, 3));
    const lowValue = item.id === "commercial" ? "−1" : "0";
    const low = origin.clone().addScaledVector(direction, 30).addScaledVector(directions[(index + 1) % 3], -12);
    group.add(makeAxisLabel(`${"XYZ"[index]}: ${lowValue}`, low, cssColors[index]));
    group.add(makeAxisLabel(`${"XYZ"[index]} · ${item.label} (1)`, end.clone().addScaledVector(direction, 20), cssColors[index]));
  });
  scene.add(group);
  return group;
}

function addOffsetGuide(scene: THREE.Scene, anchor: THREE.Vector3, position: THREE.Vector3) {
  const group = new THREE.Group();
  group.name = "afterlife-selected-offset";
  const geometry = new THREE.BufferGeometry().setFromPoints([anchor, position]);
  group.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x3d4d57, transparent: true, opacity: 0.7, depthWrite: false })));
  group.add(new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8), new THREE.MeshBasicMaterial({ color: 0x3d4d57, depthWrite: false })));
  group.children[1].position.copy(anchor);
  scene.add(group);
  return group;
}

function disposeObject(object: THREE.Object3D) {
  object.removeFromParent();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of list) {
      materials.add(material);
      const texture = (material as THREE.SpriteMaterial).map;
      if (texture) textures.add(texture);
    }
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

const DEFAULT_VIEW = new THREE.Vector3(1.25, 0.9, 1.6).normalize();
function fitMapBox(api: GraphAPI | null, box: THREE.Box3, duration = 500) {
  if (!api) return;
  const camera = api?.camera?.() as THREE.PerspectiveCamera | undefined;
  if (!camera?.isPerspectiveCamera || box.isEmpty()) return;
  const target = box.getCenter(new THREE.Vector3());
  const verticalFov = THREE.MathUtils.degToRad(camera.getEffectiveFOV());
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), DEFAULT_VIEW).normalize();
  const up = new THREE.Vector3().crossVectors(DEFAULT_VIEW, right).normalize();
  let distance = 30;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const corner = new THREE.Vector3(x, y, z).sub(target);
    const depth = corner.dot(DEFAULT_VIEW);
    distance = Math.max(distance, depth + Math.abs(corner.dot(right)) / Math.tan(horizontalFov / 2), depth + Math.abs(corner.dot(up)) / Math.tan(verticalFov / 2));
  }
  distance *= 1.12;
  camera.up.set(0, 1, 0);
  camera.near = 0.1;
  camera.far = Math.max(3000, distance + box.getSize(new THREE.Vector3()).length() * 4);
  camera.updateProjectionMatrix();
  api.cameraPosition(target.clone().addScaledVector(DEFAULT_VIEW, distance), target, duration);
}

function validAxisSelection(selection: AxisSelection, dimensions: AxisDimension[]): AxisSelection {
  const ids = dimensions.map((dimension) => dimension.id);
  const result: Partial<AxisSelection> = {};
  for (const key of ["x", "y", "z"] as const) {
    const candidate = selection[key];
    result[key] = ids.includes(candidate) && !Object.values(result).includes(candidate)
      ? candidate
      : ids.find((id) => !Object.values(result).includes(id)) ?? ids[0] ?? candidate;
  }
  return result as AxisSelection;
}

class GraphErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* The list alternative is the recovery surface. */ }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function WebglFallback({ onUseList }: { onUseList: () => void }) {
  return <div className="grid h-full place-items-center bg-muted/30 p-8 text-center"><div className="max-w-sm space-y-3"><p className="font-medium">The 3D view is unavailable here.</p><p className="text-sm text-muted-foreground">Use the project list to search, compare evidence, and open any project.</p><Button onClick={onUseList} variant="outline"><List data-icon="inline-start" />Open list</Button></div></div>;
}

export function StarMap({ projects, axes }: { projects: MapProject[]; axes: AxisSnapshot }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapRootRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [mapNotice, setMapNotice] = useState<string | null>(null);
  const graphRef = useRef<GraphAPI | null>(null);
  const [graphApi, setGraphApi] = useState<GraphAPI | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<"map" | "list">("map");
  const [webglAvailable] = useState(() => {
    if (typeof document === "undefined") return true;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2");
    context?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(context);
  });
  const graphReady = graphApi !== null;
  const cameraInitializedRef = useRef(false);
  const pendingFocusRef = useRef<{ id: string; selection: AxisSelection } | null>(null);
  const [search, setSearch] = useState(""); const [status, setStatus] = useState("all"); const [event, setEvent] = useState("all"); const [domain, setDomain] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null); const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [focusRevision, setFocusRevision] = useState(0);
  const [selection, setSelection] = useState<AxisSelection>(() => axes.dimensions.some((dimension) => dimension.id === "socialPotential") ? { x: "socialPotential", y: "deeptech", z: "demonstratedImpact" } : { x: "commercial", y: "deeptech", z: "traction" });
  const initialFocus = useSearchParams().get("focus") ?? undefined;
  const dimensions = axes.dimensions;
  const events = useMemo(() => [...new Map(projects.filter((project) => project.event).map((project) => [project.event!.id, project.event!])).values()], [projects]);
  const domains = useMemo(() => [...new Set(projects.flatMap((project) => projectDomainTerms(project, axes)))].sort((a, b) => a.localeCompare(b)), [projects, axes]);
  const filtered = useMemo(() => projects.filter((project) => projectMatches(project, axes, search, status, event, domain)), [projects, axes, search, status, event, domain]);
  const placements = useMemo(() => buildMapPositions(projects.map((project) => ({ id: project.id, scores: axes.byProject[project.id]?.scores ?? {} })), selection), [projects, axes.byProject, selection]);
  const overviewBounds = useMemo(() => {
    const bounds = new THREE.Box3(new THREE.Vector3(-125, -125, -125), new THREE.Vector3(125, 125, 125));
    placements.forEach((point) => bounds.expandByPoint(new THREE.Vector3(point.x, point.y, point.z)));
    return bounds.expandByScalar(12);
  }, [placements]);
  const selected = projects.find((project) => project.id === selectedId) ?? null;

  useEffect(() => { const el = wrapRef.current; if (!el) return; const observer = new ResizeObserver(([entry]) => setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) })); observer.observe(el); return () => observer.disconnect(); }, [view]);

  const focusPoint = useCallback((point: { x: number; y: number; z: number }) => {
    const api = graphRef.current;
    if (!api?.camera?.()) return;
    const camera = api.camera() as THREE.Camera;
    const direction = camera.position.clone().sub(new THREE.Vector3(point.x, point.y, point.z));
    if (direction.lengthSq() < 1e-6) direction.copy(DEFAULT_VIEW);
    direction.normalize();
    api.cameraPosition({ x: point.x + direction.x * 65, y: point.y + direction.y * 65, z: point.z + direction.z * 65 }, point, 650);
  }, []);
  const focusProject = useCallback((project: MapProject | undefined, activeSelection = selection) => {
    if (!project) return;
    setSelectedId(project.id); setView("map");
    if (!filtered.some((item) => item.id === project.id)) {
      setSearch(""); setStatus("all"); setEvent("all"); setDomain("all");
    }
    pendingFocusRef.current = { id: project.id, selection: activeSelection };
    setFocusRevision((current) => current + 1);
  }, [filtered, selection]);
  const initialFocusHandledRef = useRef(false);
  useEffect(() => {
    if (initialFocusHandledRef.current || !initialFocus) return;
    const project = projects.find((item) => item.id === initialFocus || item.slug === initialFocus);
    if (project) {
      initialFocusHandledRef.current = true;
      const frame = window.requestAnimationFrame(() => {
        setSelectedId(project.id);
        pendingFocusRef.current = { id: project.id, selection };
        setFocusRevision((current) => current + 1);
        if (!filtered.some((item) => item.id === project.id)) {
          setSearch(""); setStatus("all"); setEvent("all"); setDomain("all");
        }
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [filtered, initialFocus, projects, selection]);
  useEffect(() => {
    const onMapAction = (event: Event) => {
      const detail = (event as CustomEvent<{ highlight?: string[]; focus?: string; axes?: string[] }>).detail;
      if (!detail) return;
      if (detail.highlight) setHighlightIds(detail.highlight);
      const nextSelection = detail.axes?.length
        ? validAxisSelection({ x: detail.axes[0] ?? selection.x, y: detail.axes[1] ?? selection.y, z: detail.axes[2] ?? selection.z }, dimensions)
        : selection;
      if (detail.axes?.length) setSelection(nextSelection);
      if (detail.focus) focusProject(projects.find((project) => project.id === detail.focus || project.slug === detail.focus), nextSelection);
    };
    window.addEventListener("afterlife:map-action", onMapAction);
    return () => window.removeEventListener("afterlife:map-action", onMapAction);
  }, [dimensions, focusProject, projects, selection]);
  const graphData = useMemo(() => ({ nodes: filtered.map((project) => {
    const scores = axes.byProject[project.id]?.scores ?? {};
    const point = placements.get(project.id)!;
    return { ...project, axisScores: scores, anchor: point.anchor, x: point.x, y: point.y, z: point.z, fx: point.x, fy: point.y, fz: point.z, size: 1 } satisfies GraphNode;
  }), links: [] }), [filtered, axes.byProject, placements]);
  const onGraphReady = useCallback((api: GraphAPI) => {
    graphRef.current = api;
    setGraphApi(api);
    if (!cameraInitializedRef.current) {
      cameraInitializedRef.current = true;
      fitMapBox(api, overviewBounds, 0);
    }
  }, [overviewBounds]);
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!graphApi || !pending) return;
    const frame = window.requestAnimationFrame(() => {
      if (pendingFocusRef.current !== pending) return;
      if (pending.selection.x !== selection.x || pending.selection.y !== selection.y || pending.selection.z !== selection.z) return;
      const point = placements.get(pending.id);
      if (!point) return;
      pendingFocusRef.current = null;
      focusPoint(point);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusPoint, graphApi, placements, selectedId, focusRevision, selection]);
  useEffect(() => {
    if (view !== "map" || !webglAvailable || !graphReady) return;
    const scene = graphRef.current?.scene?.() as THREE.Scene | undefined;
    if (!scene) return;
    const previous = scene.getObjectByName("afterlife-axis-guides");
    if (previous) disposeObject(previous);
    const group = addSceneAxes(scene, dimensions, selection);
    return () => disposeObject(group);
  }, [dimensions, selection, view, webglAvailable, graphReady]);
  useEffect(() => {
    if (!graphApi || view !== "map" || !selected) return;
    const scene = graphApi.scene();
    const point = placements.get(selected.id);
    if (!point) return;
    const anchor = new THREE.Vector3(point.anchor.x, point.anchor.y, point.anchor.z);
    const position = new THREE.Vector3(point.x, point.y, point.z);
    const group = addOffsetGuide(scene, anchor, position);
    return () => disposeObject(group);
  }, [graphApi, placements, selected, view]);
  const updateAxis = (key: keyof AxisSelection, value: string | null) => { if (value) setSelection((current) => validAxisSelection({ ...current, [key]: value }, dimensions)); };
  const resetView = () => fitMapBox(graphRef.current, overviewBounds);
  const fitResults = () => {
    if (!graphData.nodes.length) return;
    const bounds = new THREE.Box3();
    graphData.nodes.forEach((node) => bounds.expandByPoint(new THREE.Vector3(node.fx, node.fy, node.fz)));
    bounds.expandByScalar(8);
    fitMapBox(graphRef.current, bounds);
  };
  const showList = () => {
    graphRef.current = null;
    setGraphApi(null);
    cameraInitializedRef.current = false;
    setView("list");
  };

  useEffect(() => {
    const onFullscreen = () => setExpanded(document.fullscreenElement === mapRootRef.current);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);
  async function toggleFullscreen() {
    setMapNotice(null);
    try {
      if (document.fullscreenElement === mapRootRef.current) await document.exitFullscreen();
      else await mapRootRef.current?.requestFullscreen();
    } catch { setMapNotice("Full screen is unavailable in this browser. The map can still be zoomed and panned."); }
  }
  const nodeObject = useCallback((value: object) => {
    const node = value as GraphNode;
    const color = highlightIds.length && !highlightIds.includes(node.id) ? "#c7cecb" : LIVENESS_COLOR[node.liveness];
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.SphereGeometry(3.8, 16, 12), new THREE.MeshLambertMaterial({ color })));
    // A larger invisible mesh gives each project a forgiving pointer target.
    group.add(new THREE.Mesh(new THREE.SphereGeometry(6.2, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })));
    return group;
  }, [highlightIds]);
  const selectedOffset = selected ? placements.get(selected.id)?.offset : undefined;
  const selectedOffsets = selectedOffset ? { [selection.x]: selectedOffset.x, [selection.y]: selectedOffset.y, [selection.z]: selectedOffset.z } : undefined;

  return <div ref={mapRootRef} className={cn("relative w-full min-w-0 space-y-4", expanded && "overflow-auto bg-background p-4")}>
    <div className="flex flex-col gap-3 border-b pb-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="grid gap-2 sm:grid-cols-[minmax(15rem,1fr)_auto_auto_auto]">
        <label className="relative block"><span className="sr-only">Search projects</span><Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8" placeholder="Search projects, stack, or domain" /></label>
        <FilterSelect value={status} onValueChange={setStatus} label="Status" items={[{ value: "all", label: "All status" }, ...(["alive", "dormant", "dead", "unknown"] as const).map((value) => ({ value, label: statusLabel(value) }))]} />
        <FilterSelect value={event} onValueChange={setEvent} label="Event" items={[{ value: "all", label: "All events" }, ...events.map((item) => ({ value: item.id, label: item.title }))]} />
        <FilterSelect value={domain} onValueChange={setDomain} label="Domain" items={[{ value: "all", label: "All domains" }, ...domains.map((item) => ({ value: item, label: item }))]} />
      </div>
      <div className="flex items-center gap-1 rounded-lg bg-muted p-1" role="group" aria-label="View mode">
        <Button size="sm" aria-pressed={view === "map"} variant={view === "map" ? "secondary" : "ghost"} onClick={() => setView("map")}><MapIcon data-icon="inline-start" />Map</Button>
        <Button size="sm" aria-pressed={view === "list"} variant={view === "list" ? "secondary" : "ghost"} onClick={showList}><List data-icon="inline-start" />List</Button>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground"><span aria-live="polite">{filtered.length} of {projects.length} projects</span>{(["alive", "dormant", "dead", "unknown"] as const).map((value) => <span key={value} className="flex items-center gap-1"><i className="size-2 rounded-full" style={{ backgroundColor: LIVENESS_COLOR[value] }} />{statusLabel(value)}</span>)}</div>
    {view === "map" ? <div className="relative min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2 border-y py-3" role="group" aria-label="Map dimensions">
        <AxisSelect label="X axis" value={selection.x} unavailable={[selection.y, selection.z]} dimensions={dimensions} onValueChange={(value) => updateAxis("x", value)} />
        <AxisSelect label="Y axis" value={selection.y} unavailable={[selection.x, selection.z]} dimensions={dimensions} onValueChange={(value) => updateAxis("y", value)} />
        <AxisSelect label="Z axis" value={selection.z} unavailable={[selection.x, selection.y]} dimensions={dimensions} onValueChange={(value) => updateAxis("z", value)} />
        <Button size="sm" variant="outline" disabled={!graphReady} onClick={resetView}><RotateCcw data-icon="inline-start" />Reset view</Button>
        <Button size="sm" variant="outline" disabled={!graphReady || !graphData.nodes.length} onClick={fitResults}>Fit results</Button>
        <Button size="sm" variant="outline" onClick={() => void toggleFullscreen()}>{expanded ? <Minimize2 /> : <Maximize2 />}{expanded ? "Exit full screen" : "Full screen"}</Button>
      </div>
      {mapNotice ? <p role="status" className="text-sm text-muted-foreground">{mapNotice}</p> : null}
      <div ref={wrapRef} role="region" aria-label="Interactive 3D project map" className={cn("relative h-[78svh] min-h-[34rem] overflow-hidden rounded-xl border bg-white", expanded && "h-[calc(100dvh-13rem)] min-h-[20rem]")}>
        {size.width > 0 && webglAvailable ? <GraphErrorBoundary fallback={<WebglFallback onUseList={showList} />}>
          <ForceGraph3D onReady={onGraphReady} width={size.width} height={size.height} graphData={graphData} backgroundColor="#ffffff" controlType="orbit" nodeThreeObject={nodeObject} nodeThreeObjectExtend={false} nodeLabel={(value) => { const node = value as GraphNode; return `${escapeMapLabel(node.title)} · ${statusLabel(node.liveness)}`; }} enableNodeDrag={false} showNavInfo={false} onNodeClick={(value) => focusProject(value as GraphNode)} />
        </GraphErrorBoundary> : <WebglFallback onUseList={showList} />}
        {selected ? <div className="absolute top-3 right-3 bottom-3 z-10 w-[min(23rem,calc(100%-1.5rem))] overflow-y-auto rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur-sm"><ProjectPanel project={selected} axis={axes.byProject[selected.id]} selection={selection} dimensions={dimensions} offsets={selectedOffsets} onClose={() => setSelectedId(null)} onFocus={() => focusProject(selected)} /></div> : null}
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border bg-background/90 px-3 py-2 text-xs text-muted-foreground">Drag to orbit · scroll to zoom · click a project to inspect</div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{(["x", "y", "z"] as const).map((key, index) => <span key={key} style={{ color: ["#a23e32", "#17674f", "#285c91"][index] }}>● {key.toUpperCase()} · {dimensions.find((item) => item.id === selection[key])?.label}</span>)}</div>
      <details className="rounded-lg border bg-background p-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">How are projects positioned?</summary>
        <div className="mt-3 grid gap-3 leading-5 sm:grid-cols-3">
          <p><strong className="text-foreground">Social impact potential</strong><br />A conservative estimate: (50% need severity + 30% benefit directness + 20% inclusion) ÷ 4. Each factor is rated 0–4 from the project description. Unsupported factors stay unknown and reduce evidence coverage.</p>
          <p><strong className="text-foreground">Demonstrated impact</strong><br />Evidence stages: 0 no supplied evidence; 1 explicit prototype testing; 2 reported external use; 3 reported outcomes. The position is stage ÷ 4; the highest stage is reserved for independent verification. Author claims are attributed, not independently verified.</p>
          <p><strong className="text-foreground">Spacing and uncertainty</strong><br />Nearby projects are separated without changing the score order on any axis. Selecting a project draws a line to its exact score position. Astra reviewed the rubric; Luna extracts quoted evidence; the same scoring formula is applied to every project.</p>
        </div>
      </details>
    </div> : <ProjectList projects={filtered} selectedId={selectedId} onFocus={focusProject} />}
  </div>;
}

function FilterSelect({ label, value, onValueChange, items }: { label: string; value: string; onValueChange: (value: string) => void; items: Array<{ value: string; label: string }> }) { return <Select value={value} onValueChange={(next) => { if (next) onValueChange(next); }}><SelectTrigger aria-label={label} className="w-full sm:w-36"><SelectValue>{items.find((item) => item.value === value)?.label ?? label}</SelectValue></SelectTrigger><SelectContent>{items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>; }
function AxisSelect({ label, value, unavailable, dimensions, onValueChange }: { label: string; value: string; unavailable: string[]; dimensions: AxisDimension[]; onValueChange: (value: string | null) => void }) { const selected = dimensions.find((dimension) => dimension.id === value); return <div className="flex items-center gap-1.5"><span className="text-xs text-muted-foreground">{label}</span><Select value={value} onValueChange={onValueChange}><SelectTrigger size="sm" className="w-36" aria-label={label}><SelectValue>{selected?.label ?? label}</SelectValue></SelectTrigger><SelectContent>{dimensions.map((dimension) => <SelectItem key={dimension.id} value={dimension.id} disabled={unavailable.includes(dimension.id)}>{dimension.label}</SelectItem>)}</SelectContent></Select></div>; }
function ProjectPanel({ project, axis, selection, dimensions, offsets, onClose, onFocus }: { project: MapProject; axis: AxisSnapshot["byProject"][string] | undefined; selection: AxisSelection; dimensions: AxisDimension[]; offsets: Record<string, number> | undefined; onClose: () => void; onFocus: () => void }) {
  const github = githubRepositoryUrl(project.githubRepo);
  return <aside aria-label="Selected project details" className="min-w-0"><div className="flex items-start justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-heading text-lg font-semibold leading-tight">{project.title}</h2><Badge size="sm" variant={project.liveness === "alive" ? "success-light" : project.liveness === "dormant" ? "warning-light" : "secondary"}>{statusLabel(project.liveness)}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{project.tagline || project.event?.title || "Project record"}</p></div><Button size="icon-xs" variant="ghost" aria-label="Close project panel" onClick={onClose}><X /></Button></div><div className="mt-5 space-y-4 text-sm"><ProjectDescription key={project.id} project={project} brief={project.brief} /><section><h3 className="font-medium">Liveness evidence</h3><p className="mt-1 leading-6 text-muted-foreground">{project.livenessReason || "No GitHub liveness evidence was captured for this project."}</p></section>{axis ? <section><h3 className="font-medium">Map placement</h3><p className="mt-1 leading-6 text-muted-foreground">{axis.rationale} <span className="text-foreground">{Math.round(axis.confidence * 100)}% confidence.</span></p><dl className="mt-2 grid grid-cols-3 gap-2 text-xs">{(["x", "y", "z"] as const).map((key) => { const id = selection[key]; const dimension = dimensions.find((item) => item.id === id); return <div key={key} className="rounded-md bg-muted/60 p-2"><dt className="text-muted-foreground">{key.toUpperCase()} · {dimension?.label ?? id}</dt><dd className="mt-1 font-medium tabular-nums">{id === "socialPotential" && axis.impact?.socialPotential.score == null ? "Unknown" : id === "demonstratedImpact" && !axis.impact ? "Unknown" : (axis.scores[id] ?? 0).toFixed(2)}</dd></div>; })}</dl><p className="mt-2 text-xs text-muted-foreground">These are the source scores. Display offsets: X {offsets?.[selection.x]?.toFixed(1) ?? "0.0"}, Y {offsets?.[selection.y]?.toFixed(1) ?? "0.0"}, Z {offsets?.[selection.z]?.toFixed(1) ?? "0.0"} scene units. Offsets are not evidence or confidence.</p></section> : null}<ImpactAssessment impact={axis?.impact} url={project.url} /><section><h3 className="font-medium">Team</h3><div className="mt-2 flex flex-wrap gap-1.5">{project.team.length ? project.team.map((person) => <Badge key={person.id} variant="outline" size="sm">{person.name || person.githubLogin || "Public Devpost builder"}</Badge>) : <span className="text-muted-foreground">No public team record.</span>}</div></section><section><h3 className="font-medium">Stack</h3><div className="mt-2 flex flex-wrap gap-1.5">{project.builtWith.length ? project.builtWith.slice(0, 8).map((item) => <Badge key={item} variant="secondary" size="sm">{item}</Badge>) : <span className="text-muted-foreground">No stack was captured.</span>}</div></section><div className="grid grid-cols-2 gap-2 pt-1"><Link className={cn(buttonVariants({ variant: "default", size: "sm" }))} href={projectHref(project)}>Open project</Link><Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={`/intros?project=${encodeURIComponent(project.id)}`}>Draft intro</Link></div><div className="flex flex-wrap gap-3 text-xs"><button type="button" onClick={onFocus} className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"><Focus className="size-3" />Focus</button>{safeHref(project.url) ? <a href={project.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline">Devpost <ExternalLink className="size-3" /></a> : null}{github ? <a href={github} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline">GitHub <ExternalLink className="size-3" /></a> : null}</div></div></aside>;
}
function ImpactAssessment({ impact, url }: { impact: ProjectAxisImpact | undefined; url: string }) {
  if (!impact) return <section><h3 className="font-medium">Impact evidence</h3><p className="mt-1 text-muted-foreground">No current impact classification is available for this project.</p></section>;
  const social = impact.socialPotential;
  const demonstrated = impact.demonstratedImpact;
  const stageLabels = ["No supplied evidence", "Explicit prototype testing", "Reported external use", "Reported outcomes"];
  return <section className="space-y-4"><h3 className="font-medium">Impact evidence</h3>
    <div className="rounded-lg border p-3"><h4 className="font-medium">Social impact potential · {social.score === null ? "Unknown" : `${Math.round(social.score * 100)}/100`}</h4><p className="mt-1 text-muted-foreground">{social.summary}</p>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">{(["severity", "directness", "inclusion"] as const).map((factor) => <div key={factor}><dt className="capitalize text-muted-foreground">{factor}</dt><dd>{social.factors[factor] === null ? "Unknown" : `${social.factors[factor]}/4`}</dd></div>)}</dl>
      <p className="mt-2 text-xs text-muted-foreground">Evidence confidence: {Math.round(social.confidence * 100)}%. Potential is an estimate, not an observed outcome.</p>
      {social.evidenceQuote ? <blockquote className="mt-2 border-l-2 pl-2 text-xs text-muted-foreground">“{social.evidenceQuote}”</blockquote> : null}
    </div>
    <div className="rounded-lg border p-3"><h4 className="font-medium">Demonstrated impact · {stageLabels[demonstrated.stage] ?? "Unknown"}</h4><p className="mt-1 text-muted-foreground">{demonstrated.summary}</p>{demonstrated.evidenceQuote ? <blockquote className="mt-2 border-l-2 pl-2 text-xs text-muted-foreground">“{demonstrated.evidenceQuote}”</blockquote> : null}<p className="mt-2 text-xs text-muted-foreground">Project-author evidence; independent outcomes have not been verified.</p></div>
    {safeHref(url) ? <a className="text-xs underline underline-offset-4" href={url} target="_blank" rel="noreferrer">Read the public project source</a> : null}
    <p className="text-xs text-muted-foreground">Rubric {impact.rubricVersion} · {impact.model} evidence extraction</p>
  </section>;
}
type ProjectAxisImpact = NonNullable<AxisSnapshot["byProject"][string]["impact"]>;

function ProjectList({ projects, selectedId, onFocus }: { projects: MapProject[]; selectedId: string | null; onFocus: (project: MapProject) => void }) { if (!projects.length) return <div className="border-y py-14 text-center text-sm text-muted-foreground">No projects match these filters. Clear a filter or try another term.</div>; return <div className="divide-y border-y">{projects.map((project) => <div key={project.id} className={cn("grid gap-3 px-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center", selectedId === project.id && "bg-muted/40")}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Link href={projectHref(project)} className="font-medium underline-offset-4 hover:underline">{project.title}</Link><Badge size="sm" variant={project.liveness === "alive" ? "success-light" : project.liveness === "dormant" ? "warning-light" : "secondary"}>{statusLabel(project.liveness)}</Badge>{project.event ? <span className="text-xs text-muted-foreground">{project.event.title}</span> : null}</div><p className="mt-1 truncate text-sm text-muted-foreground">{project.tagline || project.description || "No public description was captured."}</p></div><div className="flex items-center gap-2"><span className="hidden text-xs tabular-nums text-muted-foreground sm:block">{project.likes} likes</span><Button size="sm" variant="outline" onClick={() => onFocus(project)}><Focus data-icon="inline-start" />Focus</Button></div></div>)}</div>; }
