import { localWorkspaceDenied } from "@/lib/local-access";
import { NextResponse } from "next/server";
import { body, jsonError } from "@/lib/intelligence/http";
import { draftIntro, safeLog, validateText } from "@/lib/intelligence";
import { saveLocalIntro } from "@/lib/local-store";
export async function POST(request: Request) { const denied = localWorkspaceDenied(request); if (denied) return denied; try { const input = await body(request); const projectId = validateText(input.projectId, "projectId", 180); const personId = input.personId == null ? undefined : validateText(input.personId, "personId", 180); const draft = await draftIntro(projectId, personId, input.intent == null ? undefined : validateText(input.intent, "intent", 500), input.senderName == null ? undefined : validateText(input.senderName, "senderName", 120)); const saved = await saveLocalIntro({ id: crypto.randomUUID(), status: "draft", created_at: new Date().toISOString(), ...draft }); await safeLog("agent.intro", saved.mode === "openai" ? "ok" : "partial", { projectId, personId }, { id: saved.id, mode: saved.mode }); return NextResponse.json(saved, { status: 201 }); } catch (error) { return jsonError(error); } }
