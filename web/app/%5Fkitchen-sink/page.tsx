import type { Metadata } from "next";

import PromptBar from "@/components/primitives/PromptBar";
import { ProjectsGrid, type ProjectRow } from "@/components/kitchen-sink/projects-grid";
import { Badge } from "@/components/reui/badge";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/reui/timeline";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAgentRuns, getSnapshot } from "@/lib/data";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Kitchen sink",
  description: "Internal component registry for Afterlife.",
  pathname: "/%5Fkitchen-sink",
  noIndex: true,
});

function Section({ title, source, panelClassName, children }: { title: string; source: string; panelClassName?: string; children: React.ReactNode }) {
  return (
    <Frame>
      <FrameHeader>
        <FrameTitle>{title}</FrameTitle>
        <FrameDescription>
          <code className="text-xs">{source}</code>
        </FrameDescription>
      </FrameHeader>
      <FramePanel className={panelClassName}>{children}</FramePanel>
    </Frame>
  );
}

export default async function KitchenSinkPage() {
  const [{ projects, events, source }, runs] = await Promise.all([getSnapshot(), getAgentRuns(6)]);
  const eventTitle = new Map(events.map((e) => [e.id, e.title]));
  const rows: ProjectRow[] = projects.map((p) => ({
    id: p.id,
    title: p.title,
    event: (p.event_id && eventTitle.get(p.event_id)) || "-",
    liveness: p.liveness,
    stars: p.gh_stars,
    team: p.team.length,
  }));
  const counts = projects.reduce<Record<string, number>>((acc, p) => {
    acc[p.liveness] = (acc[p.liveness] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-lg font-semibold">Kitchen sink</h1>
        <p className="text-sm text-muted-foreground">
          Registry smoke test: ReUI, stock shadcn/ui and Beautiful UI on one page. Data source: {source}.
        </p>
      </div>

      <Section title="Badge" source="npx shadcn@latest add @reui/badge">
        <div className="flex flex-wrap gap-2">
          <Badge variant="success-light">alive {counts.alive ?? 0}</Badge>
          <Badge variant="warning-light">dormant {counts.dormant ?? 0}</Badge>
          <Badge variant="secondary">dead {counts.dead ?? 0}</Badge>
          <Badge variant="outline">unknown {counts.unknown ?? 0}</Badge>
          <Badge>default</Badge>
          <Badge variant="info-light">info-light</Badge>
          <Badge variant="destructive-light">destructive-light</Badge>
          <Badge radius="full" variant="primary-outline">pill</Badge>
        </div>
      </Section>

      <Section title="Data Grid" source="npx shadcn@latest add @reui/data-grid">
        <ProjectsGrid rows={rows} />
      </Section>

      <Section title="Timeline (agent_runs)" source="npx shadcn@latest add @reui/timeline">
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agent runs logged yet.</p>
        ) : (
          <Timeline defaultValue={runs.length} className="w-full max-w-xl">
            {runs.map((run, i) => (
              <TimelineItem key={run.id} step={i + 1}>
                <TimelineHeader>
                  <TimelineDate>{run.created_at.slice(0, 19).replace("T", " ")}</TimelineDate>
                  <TimelineTitle className="flex items-center gap-2">
                    {run.kind}
                    <Badge
                      variant={
                        run.status === "ok" ? "success-light" : run.status === "partial" ? "warning-light" : "destructive-light"
                      }
                    >
                      {run.status}
                    </Badge>
                  </TimelineTitle>
                </TimelineHeader>
                <TimelineIndicator />
                <TimelineSeparator />
                <TimelineContent className="line-clamp-2 break-all">{run.error ?? "ok"}</TimelineContent>
              </TimelineItem>
            ))}
          </Timeline>
        )}
      </Section>

      <Section title="Frame" source="npx shadcn@latest add @reui/frame">
        <p className="text-sm text-muted-foreground">Every section on this page is a ReUI Frame + FramePanel.</p>
      </Section>

      <Section title="Card + Tabs (stock shadcn/ui)" source="npx shadcn@latest add card tabs">
        <Tabs defaultValue="card">
          <TabsList>
            <TabsTrigger value="card">Card</TabsTrigger>
            <TabsTrigger value="other">Other tab</TabsTrigger>
          </TabsList>
          <TabsContent value="card">
            <Card className="max-w-sm">
              <CardHeader>
                <CardTitle>{projects[0]?.title ?? "No projects"}</CardTitle>
                <CardDescription>{projects[0]?.tagline}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1">
                {projects[0]?.built_with.slice(0, 6).map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="other">
            <p className="text-sm text-muted-foreground">Second tab panel.</p>
          </TabsContent>
        </Tabs>
      </Section>

      <Section title="Prompt Bar (Beautiful UI)" source="npx shadcn@latest add @beautifui/prompt-bar" panelClassName="overflow-visible">
        <div className="max-w-2xl pt-72">
          <PromptBar demo={false} placeholder="Has anyone built a WhatsApp bot for community events?" />
        </div>
      </Section>
    </div>
  );
}
