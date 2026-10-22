import type { Project } from "./data";

export type DirectoryProject = Pick<Project,
  "id" | "slug" | "title" | "tagline" | "description" | "built_with" | "domains" |
  "liveness" | "liveness_reason" | "gh_stars" | "is_winner" | "url"
> & { team: { id: string; name: string | null; devpost_username: string | null }[] };

export function directoryProjects(projects: Project[]): DirectoryProject[] {
  return projects.map((p) => ({
    id: p.id, slug: p.slug, title: p.title, tagline: p.tagline,
    description: p.description, built_with: p.built_with, domains: p.domains,
    liveness: p.liveness, liveness_reason: p.liveness_reason,
    gh_stars: p.gh_stars, is_winner: p.is_winner, url: p.url,
    team: p.team.filter((person) => !person.hidden).map(({ id, name, devpost_username }) => ({ id, name, devpost_username })),
  }));
}

/** Transparent keyword matching, with title/technology hits weighted higher. */
export function searchProjects(projects: DirectoryProject[], query: string) {
  const terms = [...new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}+#.]+/gu) ?? [])];
  if (!terms.length) return projects;
  return projects.map((project) => {
    const title = `${project.title} ${project.built_with.join(" ")} ${project.domains.join(" ")}`.toLocaleLowerCase();
    const body = `${project.tagline ?? ""} ${project.description ?? ""} ${project.team.map((p) => `${p.name ?? ""} ${p.devpost_username ?? ""}`).join(" ")}`.toLocaleLowerCase();
    const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 3 : body.includes(term) ? 1 : 0), 0);
    return { project, score };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || a.project.title.localeCompare(b.project.title)).map(({ project }) => project);
}
