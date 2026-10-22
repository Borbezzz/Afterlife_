"use client";

import dynamic from "next/dynamic";

// CopilotKit creates browser/session identifiers. Keep that runtime below the
// static archive UI instead of making every route wait for client hydration.
const ArchiveChat = dynamic(() => import("./archive-chat"), {
  ssr: false,
  loading: () => <div className="afterlife-panel p-5 text-sm text-muted-foreground" role="status">Connecting the archive assistant…</div>,
});

export function ExploreAgent() {
  return <ArchiveChat />;
}
