import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowLeft, Code, ExternalLink, MessageSquare } from "lucide-react";

import { Badge } from "@/components/reui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageFrame } from "@/components/shell/page-frame";
import { ProjectDescription } from "@/components/projects/project-description";
import { getProjectBriefs } from "@/lib/project-briefs";
import { getProject, getProjects, getSnapshot } from "@/lib/data";
import { getLocalProfiles } from "@/lib/local-store";
import { pageMetadata } from "@/lib/metadata";
import { projectHref } from "@/lib/routes";
import { githubProfileUrl, githubRepositoryUrl, safeExternalUrl as isHttpUrl } from "@/lib/urls";
import { projectVisibility, projectWithVisibleTeam } from "@/lib/visibility";
import { cn } from "cn";

export async function generateStaticParams() {
  const projects = await getProjects();
  return projects.map((project) => ({ id: project.slug }));
}

export async function generateMetadata({ params }: PageProps<"/p/[id]">): Promise<Metadata> {
  const project = await getProject((await params).id);
  if (!project) {
    return pageMetadata({
      title: "Project not found",
      description: "This London hackathon project is not available in the Afterlife archive.",
      pathname: `/p/${encodeURIComponent((await params).id)}`,
      noIndex: true,
    });
  }

  const summary = project.tagline || project.description || "A London hackathon project preserved in the Afterlife archive.";
  return pageMetadata({
    title: project.title,
    description: summary.slice(0, 160),
    pathname: `/p/${encodeURIComponent(project.slug)}`,
  });
}

function livenessVariant(liveness: "alive" | "dormant" | "dead" | "unknown") {
  if (liveness === "alive") return "success-light" as const;
  if (liveness === "dormant") return "warning-light" as const;
  return "secondary" as const;
}

export default function ProjectPage({ params }: PageProps<"/p/[id]">) {
  return <Suspense fallback={<PageFrame title="Project"><div className="h-96 rounded-xl border bg-muted/20" /></PageFrame>}><ProjectContent params={params} /></Suspense>;
}

async function ProjectContent({ params }: { params: PageProps<"/p/[id]">["params"] }) {
  await connection();
  const rawProject = await getProject((await params).id);
  if (!rawProject) notFound();
  const [{ events, projects: rawProjects }, profiles] = await Promise.all([getSnapshot(), getLocalProfiles()]);
  const project = projectWithVisibleTeam(rawProject, profiles);
  const briefs = await getProjectBriefs([project]);
  const projects = projectVisibility(rawProjects, profiles);
  const event = events.find((item) => item.id === project.event_id) ?? null;
  const memberIds = new Set(project.team.map((person) => person.id));
  const related = projects.filter((candidate) => candidate.id !== project.id && candidate.team.some((person) => memberIds.has(person.id))).slice(0, 6);
  const github = githubRepositoryUrl(project.github_repo);
  const evidence = [
    project.is_winner ? "Devpost winner" : null,
    project.github_repo ? "Public GitHub repository" : null,
    project.gh_stars !== null ? `${project.gh_stars} GitHub stars` : null,
    project.gh_commits_after_event !== null ? `${project.gh_commits_after_event} commits after event` : null,
  ].filter((item): item is string => Boolean(item));

  return <PageFrame title={project.title} description={<span className="flex flex-wrap items-center gap-2"><Badge variant={livenessVariant(project.liveness)}>{project.liveness === "unknown" ? "Unverified" : project.liveness}</Badge>{event ? <Badge variant="outline">{event.title}</Badge> : <Badge variant="outline">Event not recorded</Badge>}</span>}>
    <div className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3"><Link href={`/explore?focus=${encodeURIComponent(project.id)}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}><ArrowLeft data-icon="inline-start" />Back to map</Link><div className="flex flex-wrap gap-2"><Link href={`/intros?project=${encodeURIComponent(project.id)}`} className={cn(buttonVariants({ variant: "default", size: "sm" }))}><MessageSquare data-icon="inline-start" />Draft introduction</Link>{github ? <a href={github} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><Code data-icon="inline-start" />Repository</a> : null}</div></div>
      <div className="max-w-3xl"><ProjectDescription project={project} brief={briefs[project.id]} headingLevel={2} /></div>
      <div id="project-evidence" className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.75fr)]"><div className="space-y-5"><Card><CardHeader><CardTitle>Evidence and liveness</CardTitle><CardDescription>Only public source data is shown here.</CardDescription></CardHeader><CardContent className="space-y-4"><p className="leading-7 text-muted-foreground">{project.liveness_reason || "No GitHub liveness evidence was captured for this project."}</p><div className="flex flex-wrap gap-1.5">{evidence.length ? evidence.map((item) => <Badge key={item} variant="secondary">{item}</Badge>) : <span className="text-sm text-muted-foreground">No additional public evidence was captured.</span>}</div>{project.stopped_at ? <p className="text-sm text-muted-foreground">Recorded stopping point: {project.stopped_at}</p> : null}</CardContent></Card>
        <Card><CardHeader><CardTitle>Project links</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{isHttpUrl(project.url) ? <a href={project.url} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Devpost <ExternalLink data-icon="inline-end" /></a> : null}{project.links.filter(isHttpUrl).map((link) => <a key={link} href={link} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Demo or link <ExternalLink data-icon="inline-end" /></a>)}{!isHttpUrl(project.url) && !project.links.some(isHttpUrl) && !github ? <p className="text-sm text-muted-foreground">No public project links were captured.</p> : null}</CardContent></Card>
        <Card><CardHeader><CardTitle>Other work by this team</CardTitle><CardDescription>Projects sharing a public team member.</CardDescription></CardHeader><CardContent>{related.length ? <ul className="divide-y">{related.map((item) => <li key={item.id} className="py-3 first:pt-0"><Link href={projectHref(item)} className="font-medium underline-offset-4 hover:underline">{item.title}</Link><p className="mt-1 text-sm text-muted-foreground">{item.tagline || "No public tagline was captured."}</p></li>)}</ul> : <p className="text-sm text-muted-foreground">No other public projects by these people were found.</p>}</CardContent></Card></div>
        <aside className="space-y-5"><Card><CardHeader><CardTitle>Team</CardTitle><CardDescription>Public Devpost and GitHub identities only.</CardDescription></CardHeader><CardContent>{project.team.length ? <ul className="space-y-3">{project.team.map((person) => <li key={person.id}><p className="font-medium">{person.name || person.github_login || person.devpost_username || "Public Devpost builder"}</p><div className="mt-1 flex flex-wrap gap-3 text-sm">{isHttpUrl(person.devpost_url) ? <a className="underline-offset-4 hover:underline" href={isHttpUrl(person.devpost_url) ?? undefined} target="_blank" rel="noreferrer">Devpost</a> : null}{githubProfileUrl(person.github_login) ? <a className="underline-offset-4 hover:underline" href={githubProfileUrl(person.github_login) ?? undefined} target="_blank" rel="noreferrer">GitHub</a> : null}</div></li>)}</ul> : <p className="text-sm text-muted-foreground">No public team record was captured.</p>}</CardContent></Card>
          <Card><CardHeader><CardTitle>Stack and domains</CardTitle></CardHeader><CardContent className="space-y-4"><div><p className="mb-2 text-xs font-medium text-muted-foreground">BUILT WITH</p><div className="flex flex-wrap gap-1.5">{project.built_with.length ? project.built_with.map((item) => <Badge key={item} variant="secondary">{item}</Badge>) : <span className="text-sm text-muted-foreground">Not captured</span>}</div></div><div><p className="mb-2 text-xs font-medium text-muted-foreground">DOMAINS</p><div className="flex flex-wrap gap-1.5">{project.domains.length ? project.domains.map((item) => <Badge key={item} variant="outline">{item}</Badge>) : <span className="text-sm text-muted-foreground">Not classified</span>}</div></div></CardContent></Card></aside>
      </div>
    </div>
  </PageFrame>;
}
