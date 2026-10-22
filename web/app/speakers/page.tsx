import type { Metadata } from "next";

import { SpeakerFinderClient } from "@/components/discovery/speaker-finder-client";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Find speakers",
  description: "Find London builders for a topic, with public project evidence to support each speaker shortlist.",
  pathname: "/speakers",
});

export default function Page() {
  return <section className="mx-auto w-full max-w-6xl px-4 py-7"><SpeakerFinderClient /></section>;
}
