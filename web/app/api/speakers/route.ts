import { localWorkspaceDenied } from "@/lib/local-access";
import { NextResponse } from "next/server";
import { body, jsonError, searchWarning } from "@/lib/intelligence/http";
import { findSpeakersWithStatus, limitValue, narrate, safeLog, validateText } from "@/lib/intelligence";

export async function POST(request: Request) {
  const denied = localWorkspaceDenied(request); if (denied) return denied;
  try {
    const input = await body(request);
    const topic = validateText(input.topic, "topic", 500);
    const { candidates, retrieval } = await findSpeakersWithStatus(topic, limitValue(input.limit));
    const surrogate = candidates.map((candidate) => ({ project: { ...candidate.projects[0], team: [candidate.person] }, score: candidate.score, reasons: candidate.reasons, evidence: candidate.evidence, retrieval }));
    const narration = await narrate(topic, surrogate, "speaker discovery");
    const warning = searchWarning(retrieval, narration.mode);
    await safeLog("agent.speakers", warning ? "partial" : "ok", { topic }, { count: candidates.length, mode: narration.mode, retrieval });
    return NextResponse.json({ candidates, summary: narration.text, mode: narration.mode, retrieval, ...(warning ? { warning } : {}) });
  } catch (error) {
    await safeLog("agent.speakers", "failed", null, null, error instanceof Error ? error.message : "Request failed");
    return jsonError(error);
  }
}
