import { NextResponse } from "next/server";
import { cogneeStatus } from "@/lib/cognee";
import { localWorkspaceDenied } from "@/lib/local-access";

export async function GET(request: Request) {
  const denied = localWorkspaceDenied(request); if (denied) return denied;
  const result = await cogneeStatus();
  return NextResponse.json(result, { status: result.status === "ready" ? 200 : 503 });
}
