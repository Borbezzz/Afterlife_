import { localWorkspaceDenied } from "@/lib/local-access";
import { NextResponse } from "next/server";
import { semanticIndexStatus, warmSemanticIndex } from "@/lib/intelligence";

export async function GET() { return NextResponse.json(await semanticIndexStatus()); }

export async function POST(request: Request) {
  const denied = localWorkspaceDenied(request); if (denied) return denied;
  const result = await warmSemanticIndex();
  return NextResponse.json(result, { status: result.ready ? 200 : 503 });
}
