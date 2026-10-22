import { localWorkspaceDenied } from "@/lib/local-access";
import { NextResponse } from "next/server";
import { body, jsonError, searchWarning } from "@/lib/intelligence/http";
import { narrate, safeLog, searchProjectsWithStatus, validateText } from "@/lib/intelligence";

export async function POST(request: Request) {
  const denied = localWorkspaceDenied(request); if (denied) return denied;
  try {
    const input = await body(request);
    const message = validateText(input.message, "message", 1000);
    const { results, retrieval } = await searchProjectsWithStatus(message, 8);
    const narration = await narrate(message, results, "answer the user’s question about the project archive");
    const warning = searchWarning(retrieval, narration.mode);
    await safeLog("agent.chat", warning ? "partial" : "ok", { message }, { count: results.length, mode: narration.mode, retrieval });
    return NextResponse.json({ answer: narration.text, results, mode: narration.mode, retrieval, ...(warning ? { warning } : {}), actions: { highlight: results.map((result) => result.project.id), ...(results[0] ? { focus: results[0].project.id } : {}) } });
  } catch (error) {
    await safeLog("agent.chat", "failed", null, null, error instanceof Error ? error.message : "Request failed");
    return jsonError(error);
  }
}
