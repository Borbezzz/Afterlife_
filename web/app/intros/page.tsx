import type { Metadata } from "next";
import { Suspense } from "react";

import { IntrosClient } from "@/components/intros/intros-client";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Introductions",
  description: "Draft evidence-backed introductions between London builders whose projects, skills, or interests belong in the same conversation.",
  pathname: "/intros",
  noIndex: true,
});

export default function Page() {
  return <section className="mx-auto w-full max-w-6xl px-4 py-7"><Suspense fallback={<p className="text-sm text-muted-foreground">Loading intro drafts…</p>}><IntrosClient /></Suspense></section>;
}
