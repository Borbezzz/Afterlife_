import "server-only";

import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { AgentRun } from "@/lib/data";
import type { IntroDraft, LocalProfile } from "@/lib/contracts";

const LOCAL_DIR = path.join(process.cwd(), "..", "data", "local");
const FILES = {
  profiles: path.join(LOCAL_DIR, "profiles.json"),
  intros: path.join(LOCAL_DIR, "intros.json"),
  runs: path.join(LOCAL_DIR, "agent-runs.json"),
} as const;

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(file, "utf8")) as T; } catch { return fallback; }
}
async function writeJson(file: string, value: unknown) {
  await mkdir(LOCAL_DIR, { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), "utf8");
  await rename(temp, file);
}

async function mutateJson<T, R>(file: string, fallback: T, update: (value: T) => R | Promise<R>): Promise<R> {
  await mkdir(LOCAL_DIR, { recursive: true });
  const lock = `${file}.lock`;
  let acquired = false;
  for (let attempt = 0; attempt < 400; attempt += 1) {
    try {
      await mkdir(lock);
      acquired = true;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const info = await stat(lock);
        if (Date.now() - info.mtimeMs > 30_000) await rm(lock, { recursive: true, force: true });
      } catch { /* Another writer may have released the lock already. */ }
      await delay(10);
    }
  }
  if (!acquired) throw new Error("Local data store is busy; please retry");
  try {
    const value = await readJson<T>(file, fallback);
    const result = await update(value);
    await writeJson(file, value);
    return result;
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

export async function getLocalProfiles() { return readJson<LocalProfile[]>(FILES.profiles, []); }
export async function saveLocalProfile(profile: LocalProfile) {
  return mutateJson(FILES.profiles, [] as LocalProfile[], (profiles) => {
    const index = profiles.findIndex((item) => item.personId === profile.personId);
    if (index >= 0) profiles[index] = profile; else profiles.push(profile);
    return profile;
  });
}
export async function getLocalIntros() { return readJson<IntroDraft[]>(FILES.intros, []); }
export async function saveLocalIntro(draft: IntroDraft) {
  return mutateJson(FILES.intros, [] as IntroDraft[], (drafts) => { drafts.unshift(draft); return draft; });
}
export async function updateLocalIntro(id: string, patch: Pick<IntroDraft, "subject" | "body">) {
  return mutateJson(FILES.intros, [] as IntroDraft[], (drafts) => {
    const draft = drafts.find((item) => item.id === id);
    if (!draft) return null;
    draft.subject = patch.subject; draft.body = patch.body;
    return draft;
  }).then((draft) => draft);
}
export async function getLocalRuns(limit = 100) {
  return (await readJson<AgentRun[]>(FILES.runs, [])).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
}
export async function logLocalRun(run: Omit<AgentRun, "id" | "created_at">) {
  const entry: AgentRun = { ...run, id: `local-${crypto.randomUUID()}`, created_at: new Date().toISOString() };
  await mutateJson(FILES.runs, [] as AgentRun[], (runs) => { runs.unshift(entry); runs.splice(500); return entry; });
  return entry;
}
