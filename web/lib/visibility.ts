import "server-only";

import type { Person, Project } from "@/lib/data";
import type { LocalProfile } from "@/lib/contracts";

/** Applies private local profile choices without removing public project records. */
export function projectWithVisibleTeam(project: Project, profiles: LocalProfile[]): Project {
  const profileByPerson = new Map(profiles.map((profile) => [profile.personId, profile]));
  const team = project.team.flatMap((person) => {
    const profile = profileByPerson.get(person.id);
    if (person.hidden || profile?.hidden) return [];
    // A locally saved display name is applied only after the person opted in.
    const visiblePerson: Person = profile?.consent && profile.name ? { ...person, name: profile.name } : person;
    return [visiblePerson];
  });
  return { ...project, team };
}

export function projectVisibility(projects: Project[], profiles: LocalProfile[]) {
  return projects.map((project) => projectWithVisibleTeam(project, profiles));
}
