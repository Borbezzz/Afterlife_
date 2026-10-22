import type { Metadata } from "next";

import { BeforeYouBuildClient } from "@/components/discovery/before-you-build-client";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Before you build",
  description: "Explore related London hackathon projects before you start building, and find the people who have already tried the idea.",
  pathname: "/before-you-build",
});

export default function Page() {
  return <section className="mx-auto w-full max-w-6xl px-4 py-7"><BeforeYouBuildClient /></section>;
}
