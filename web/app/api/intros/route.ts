import { NextResponse } from "next/server";
import { body, jsonError } from "@/lib/intelligence/http";
import { safeLog, validateText } from "@/lib/intelligence";
import { assertLocalWorkspaceRequest } from "@/lib/local-access";
import { getLocalIntros, updateLocalIntro } from "@/lib/local-store";

export async function GET(request: Request) {
  try { assertLocalWorkspaceRequest(request); return NextResponse.json({ drafts: await getLocalIntros() }); }
  catch (error) { return jsonError(error, 403); }
}
export async function PATCH(request: Request) {
  try {
    assertLocalWorkspaceRequest(request);
    const input = await body(request); const id = validateText(input.id, "id", 100);
    const draft = await updateLocalIntro(id, { subject: validateText(input.subject, "subject", 200), body: validateText(input.body, "body", 5000) });
    if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    await safeLog("agent.intro.edit", "ok", { id }, { id }); return NextResponse.json(draft);
  } catch (error) { return jsonError(error, error instanceof Error && error.message.includes("loopback") ? 403 : 400); }
}
