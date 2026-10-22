"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageFrame } from "@/components/shell/page-frame";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <PageFrame title="The archive could not load" description="Try loading this page again.">
      <div className="flex items-center gap-4">
        <Button onClick={() => retry()}>Try again</Button>
        <Link href="/explore" className="text-sm underline underline-offset-4">Explore projects</Link>
      </div>
    </PageFrame>
  );
}
