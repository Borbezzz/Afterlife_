import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { body, jsonError } from "@/lib/intelligence/http";
import { safeLog, validateText } from "@/lib/intelligence";
import { getLocalProfiles, saveLocalProfile } from "@/lib/local-store";
import { getPeople } from "@/lib/data";
import { assertLocalWorkspaceRequest } from "@/lib/local-access";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function githubLoginsFromUser(user: { identities?: Array<{ provider?: string; identity_data?: Record<string, unknown> }> | null }) {
  const values: unknown[] = [];
  for (const identity of user.identities ?? []) {
    if (identity.provider === "github") values.push(identity.identity_data?.user_name, identity.identity_data?.login, identity.identity_data?.preferred_username, identity.identity_data?.username);
  }
  return new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0).map((value) => value.toLowerCase()));
}

async function publicPerson(personId: string) {
  const person = (await getPeople()).find((candidate) => candidate.id === personId);
  if (!person) throw new Error("That public builder record was not found.");
  return person;
}

async function verifyOwnership(request: Request, personId: string) {
  if (!supabaseConfigured) return { verified: false };
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("Sign in with GitHub before saving a verified profile.");
  const client = createClient(supabaseUrl!, supabaseAnonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error("Your GitHub session could not be verified. Sign in again and retry.");
  const person = await publicPerson(personId);
  if (!person.github_login) throw new Error("This public record has no linked GitHub login, so ownership cannot be verified.");
  if (!githubLoginsFromUser(data.user).has(person.github_login.toLowerCase())) throw new Error("The signed-in GitHub account does not match this public record.");
  return { verified: true, githubLogin: person.github_login };
}

export async function GET(request: Request) { try { const personId = new URL(request.url).searchParams.get("personId"); if (!personId) throw new Error("personId is required"); const normalizedPersonId = validateText(personId, "personId", 180); const verification = supabaseConfigured ? await verifyOwnership(request, normalizedPersonId) : (assertLocalWorkspaceRequest(request), await publicPerson(normalizedPersonId), { verified: false }); const profile = (await getLocalProfiles()).find((item) => item.personId === normalizedPersonId); return NextResponse.json({ profiles: profile ? [profile] : [], ...verification }); } catch (error) { return jsonError(error); } }
export async function POST(request: Request) { try { const input = await body(request); if (input.consent !== true) throw new Error("consent must be true to save a profile"); const personId = validateText(input.personId, "personId", 180); const verification = supabaseConfigured ? await verifyOwnership(request, personId) : (assertLocalWorkspaceRequest(request), await publicPerson(personId), { verified: false }); const profile = { personId, ...(typeof input.name === "string" ? { name: validateText(input.name, "name", 120) } : {}), buildingNow: typeof input.buildingNow === "string" ? validateText(input.buildingNow, "buildingNow", 1000, false) : "", wantToMeet: typeof input.wantToMeet === "string" ? validateText(input.wantToMeet, "wantToMeet", 1000, false) : "", openToSpeaking: Boolean(input.openToSpeaking), hidden: Boolean(input.hidden), consent: true, updated_at: new Date().toISOString() }; await saveLocalProfile(profile); await safeLog("profile.save", "ok", { personId: profile.personId }, { hidden: profile.hidden, verified: verification.verified }); return NextResponse.json({ profile, ...verification }); } catch (error) { return jsonError(error); } }
