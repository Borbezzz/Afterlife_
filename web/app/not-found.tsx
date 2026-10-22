import Link from "next/link";
import type { Metadata } from "next";

import { PageFrame } from "@/components/shell/page-frame";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <PageFrame title="Page not found" description="This page or project is not in the archive.">
      <Link href="/explore" className="font-medium underline underline-offset-4">Explore projects</Link>
    </PageFrame>
  );
}
