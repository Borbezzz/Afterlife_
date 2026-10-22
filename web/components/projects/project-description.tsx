import { createProjectBrief, parseProjectDescription, type BriefProject, type ProjectBrief } from "@/lib/project-brief";

/** A product-first brief, with the complete author write-up one click away. */
export function ProjectDescription({ project, brief, headingLevel = 3 }: { project: BriefProject; brief?: ProjectBrief; headingLevel?: 2 | 3 }) {
  const overview = brief ?? createProjectBrief(project);
  const sections = parseProjectDescription(project.description);
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const SourceHeading = headingLevel === 2 ? "h3" : "h4";

  return <section aria-label="Project overview" className="min-w-0">
    <Heading className="text-sm font-medium">What it does</Heading>
    <p className="mt-2 text-pretty text-sm leading-6 text-foreground [overflow-wrap:anywhere]">{overview.summary}</p>
    {overview.highlights.length ? <ul className="mt-3 list-disc space-y-2 pl-4 text-sm leading-6 text-muted-foreground marker:text-muted-foreground/60">
      {overview.highlights.map((highlight) => <li key={highlight} className="pl-1 text-pretty [overflow-wrap:anywhere]">{highlight}</li>)}
    </ul> : null}
    {sections.length ? <details className="mt-4 border-y py-3">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-2">Read full project write-up</summary>
      <div className="mt-4 space-y-5 text-sm leading-6 text-muted-foreground">
        {sections.map((section, index) => <div key={index}>
          {section.title ? <SourceHeading className="mb-2 font-medium text-foreground">{section.title}</SourceHeading> : null}
          <p className="whitespace-pre-line [overflow-wrap:anywhere]">{section.text}</p>
        </div>)}
      </div>
    </details> : null}
  </section>;
}
