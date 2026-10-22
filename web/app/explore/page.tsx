import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import { ExploreAgent } from "@/components/agent/explore-agent";
import { StarMap, type MapProject } from "@/components/explore/star-map";
import { Badge } from "@/components/reui/badge";
import { PageFrame } from "@/components/shell/page-frame";
import { getAxesSnapshot } from "@/lib/axes";
import { getSnapshot } from "@/lib/data";
import { getLocalProfiles } from "@/lib/local-store";
import { pageMetadata } from "@/lib/metadata";
import { projectVisibility } from "@/lib/visibility";
import { getProjectBriefs } from "@/lib/project-briefs";

export const metadata: Metadata = pageMetadata({
  title: "Explore London hackathon projects",
  description: "Search a 3D archive of London hackathon projects, see what survived beyond the event, and find the people behind it.",
  pathname: "/explore",
});

export default function ExplorePage() {
  return <Suspense fallback={<PageFrame title="Explore"><div className="h-96 rounded-xl border bg-muted/20" /></PageFrame>}><ExploreContent /></Suspense>;
}

async function ExploreContent() {
  await connection();
  const [{ projects: rawProjects, events }, profiles] = await Promise.all([getSnapshot(), getLocalProfiles()]);
  const projects = projectVisibility(rawProjects, profiles);
  const [axes, briefs] = await Promise.all([getAxesSnapshot(projects), getProjectBriefs(projects)]);
  const eventById = new Map(events.map((event) => [event.id, event]));
  const mapProjects: MapProject[] = projects.map((project) => ({
    id: project.id, slug: project.slug, title: project.title, tagline: project.tagline,
    description: project.description, brief: briefs[project.id], liveness: project.liveness, livenessReason: project.liveness_reason,
    likes: project.likes, githubStars: project.gh_stars,
    domains: project.domains.length ? project.domains : axes.dimensions
      .filter((dimension) => ["ai", "climate", "health", "fintech", "devtools", "consumer"].includes(dimension.id) && (axes.byProject[project.id]?.scores[dimension.id] ?? 0) >= 0.5)
      .map((dimension) => dimension.label),
    inferredDomains: project.domains.length === 0,
    builtWith: project.built_with,
    event: project.event_id && eventById.has(project.event_id) ? { id: project.event_id, title: eventById.get(project.event_id)!.title } : null,
    url: project.url, githubRepo: project.github_repo, links: project.links,
    team: project.team.map((person) => ({ id: person.id, name: person.name, devpostUrl: person.devpost_url, githubLogin: person.github_login })),
  }));
  return <div className="mx-auto w-full max-w-[112rem] px-4 py-6 sm:px-6">
    <header className="mb-5 flex flex-wrap items-center gap-3"><h1 className="mr-2 text-2xl font-semibold tracking-tight">Explore</h1><Badge variant="secondary">{projects.length} projects</Badge><Badge variant="secondary">{events.length} events</Badge></header>
    <div className="space-y-8"><Suspense fallback={<div className="h-96 rounded-xl border bg-muted/20" />}><StarMap projects={mapProjects} axes={axes} /></Suspense><ExploreAgent /></div>
  </div>;
}
