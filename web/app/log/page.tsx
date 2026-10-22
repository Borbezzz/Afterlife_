import type { Metadata } from "next";

import { AgentRunLog } from "@/components/log/agent-run-log";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Agent log",
  description: "Review the Afterlife agent's searches, evidence checks, and where the archive could not make a confident match.",
  pathname: "/log",
  noIndex: true,
});

export default function Page() {
  return <AgentRunLog />;
}
