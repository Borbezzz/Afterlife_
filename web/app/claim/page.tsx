import type { Metadata } from "next";

import { ClaimProfile } from "@/components/profile/claim-profile";
import { getPeople, getProjects } from "@/lib/data";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Claim your profile",
  description: "Claim your Afterlife profile, choose what public project information to show, and share what you are building now.",
  pathname: "/claim",
  noIndex: true,
});

export default async function Page() {
  const [people, projects] = await Promise.all([getPeople(), getProjects()]);
  const profiles = people
    .map((person) => ({
      id: person.id,
      name: person.name ?? person.devpost_username ?? "Unnamed builder",
      devpostUrl: person.devpost_url,
      githubLogin: person.github_login,
      projects: projects
        .filter((project) => project.team.some((member) => member.id === person.id))
        .map((project) => ({
          id: project.id,
          title: project.title,
          slug: project.slug,
          liveness: project.liveness,
        })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return <ClaimProfile profiles={profiles} />;
}
