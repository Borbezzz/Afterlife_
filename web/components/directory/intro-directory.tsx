"use client";

import { useSearchParams } from "next/navigation";
import { ProjectDirectory } from "./project-directory";
import type { DirectoryProject } from "@/lib/search";

export function IntroDirectory({ projects }: { projects: DirectoryProject[] }) {
  const params = useSearchParams();
  const project = params.get("project") ?? "";
  const person = params.get("person") ?? "";
  return <ProjectDirectory key={`${project}:${person}`} projects={projects} mode="intros" initialProject={project} initialPerson={person} />;
}
