import { NextResponse } from "next/server";
import type { IntelligenceMode, RetrievalStatus } from "@/lib/contracts";

export async function body(request: Request): Promise<Record<string, unknown>> { try { const value = await request.json(); if (!value || Array.isArray(value) || typeof value !== "object") throw new Error(); return value as Record<string, unknown>; } catch { throw new Error("Expected a JSON object"); } }
export function jsonError(error: unknown, status = 400) { return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed" }, { status }); }

export function searchWarning(retrieval: RetrievalStatus, mode?: IntelligenceMode) {
  const warnings: string[] = [];
  if (retrieval.status !== "used" || retrieval.indexing?.state === "processing" || retrieval.indexing?.state === "failed") warnings.push(retrieval.message);
  if (mode === "local") warnings.push("AI summary is unavailable; showing an archive summary.");
  return warnings.length ? warnings.join(" ") : undefined;
}
