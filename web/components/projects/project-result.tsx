import Link from "next/link";
import { ExternalLink, GitFork, Heart, Sparkles } from "lucide-react";

import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { projectHref } from "@/lib/routes";
import { safeExternalUrl } from "@/lib/urls";

export { safeExternalUrl } from "@/lib/urls";

export type ResultProject = {
  id: string;
  slug: string;
  title: string;
  tagline?: string | null;
  description?: string | null;
  built_with?: string[];
  domains?: string[];
  liveness?: "alive" | "dormant" | "dead" | "unknown";
  liveness_reason?: string | null;
  gh_stars?: number | null;
  likes?: number;
  is_winner?: boolean;
};

export type ResultEvidence = { source: string; label: string; url?: string | null };

export function ProjectResult({
  item,
  onDraft,
}: {
  item: { project: ResultProject; score: number; reasons: string[]; evidence: ResultEvidence[] };
  onDraft: (projectId: string) => void;
}) {
  const { project } = item;
  const liveness = project.liveness ?? "unknown";
  const livenessText = {
    alive: "Active",
    dormant: "Dormant",
    dead: "Archived",
    unknown: "Not checked",
  }[liveness];
  const livenessVariant = liveness === "alive" ? "success-light" : liveness === "dead" ? "secondary" : "warning-light";

  return (
    <article className="border-b border-border py-5 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={projectHref(project)} className="text-base font-semibold tracking-tight hover:underline">
              {project.title}
            </Link>
            <Badge variant={livenessVariant} size="sm" radius="full">{livenessText}</Badge>
            {project.is_winner ? <Badge variant="primary-light" size="sm" radius="full">Winner</Badge> : null}
          </div>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {project.tagline || project.description || "No project summary was captured."}
          </p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground" title="Additive search ranking score. Higher scores rank nearer the top; this is not a probability.">Relevance {item.score.toFixed(1)}</span>
      </div>

      {item.reasons.length ? (
        <ul className="mt-3 space-y-1 text-sm">
          {item.reasons.slice(0, 3).map((reason) => <li key={reason} className="flex gap-2"><Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />{reason}</li>)}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(project.domains?.length ? project.domains : project.built_with ?? []).slice(0, 5).map((tag) => <Badge key={tag} variant="outline" size="sm" radius="full">{tag}</Badge>)}
        {project.gh_stars ? <Badge variant="outline" size="sm" radius="full"><GitFork />{project.gh_stars}</Badge> : null}
        {project.likes ? <Badge variant="outline" size="sm" radius="full"><Heart />{project.likes}</Badge> : null}
      </div>

      {item.evidence.length ? <div className="mt-3 flex flex-wrap gap-1.5">{item.evidence.slice(0, 4).map((evidence, index) => { const url = safeExternalUrl(evidence.url); return url ? <a key={`${evidence.source}-${index}`} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"><ExternalLink className="size-3" />{evidence.source}: {evidence.label}</a> : <span key={`${evidence.source}-${index}`} className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">{evidence.source}: {evidence.label}</span>; })}</div> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href={projectHref(project)}>Open project</Link>} />
        <Button size="sm" onClick={() => onDraft(project.id)}>Draft an intro</Button>
      </div>
    </article>
  );
}
