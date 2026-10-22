import { NextResponse } from "next/server";
import { getAgentRuns } from "@/lib/data";
import { assertLocalWorkspaceRequest } from "@/lib/local-access";
import { getLocalRuns } from "@/lib/local-store";

export async function GET(request: Request) {
  try {
    assertLocalWorkspaceRequest(request);
    const merged = [...await getLocalRuns(100), ...await getAgentRuns(100)];
    const unique = [...new Map(merged.map((run) => [String(run.id), run])).values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return NextResponse.json({ runs: unique.slice(0, 100) });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed" }, { status: 403 }); }
}
