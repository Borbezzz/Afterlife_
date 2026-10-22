/**
 * Afterlife data layer (server only).
 *
 * Models mirror supabase/migrations/0001_init.sql. Reads come from Supabase
 * when NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are both
 * set; otherwise (or if a Supabase query fails) they fall back to the ingest
 * snapshot at ../data/projects.json, read from disk at build/server time.
 *
 * Every getter is cached with "use cache" (Cache Components is on), so pages
 * that use them prerender at build time.
 */
import "server-only";

import { findProject, parseAgentRuns } from "./records";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { cacheLife } from "next/cache";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------ */
/* Models (columns of 0001_init.sql)                                    */
/* ------------------------------------------------------------------ */

/** ISO date ("2026-09-12") for `date` columns. */
export type ISODate = string;
/** ISO timestamp for `timestamptz` columns. */
export type ISOTimestamp = string;

export type Liveness = "alive" | "dormant" | "dead" | "unknown";
export type AgentRunStatus = "ok" | "partial" | "failed";

/** `events`: hackathons (Devpost challenges, later Luma events). */
export interface Event {
  id: string; // "devpost:<hackathon id>"
  source: string;
  title: string;
  url: string;
  gallery_url: string | null;
  location: string | null;
  organization: string | null;
  starts_on: ISODate | null;
  ends_on: ISODate | null;
  themes: string[];
  registrations: number | null;
  updated_at?: ISOTimestamp;
}

/** `people`: builders. Unclaimed rows hold public Devpost data only. */
export interface Person {
  id: string; // "devpost:<username>"
  devpost_username: string | null;
  name: string | null;
  devpost_url: string | null;
  avatar_url: string | null;
  github_login: string | null;
  claimed_by: string | null; // auth.users uuid
  hidden: boolean;
  updated_at?: ISOTimestamp;
}

/** `projects` (minus `embedding` and `raw`, which the UI never needs). */
export interface Project {
  id: string; // "devpost:<slug>"
  slug: string;
  title: string;
  tagline: string | null;
  description: string | null;
  url: string;
  thumbnail_url: string | null;
  event_id: string | null;
  submitted_at: ISOTimestamp | null;
  built_with: string[];
  links: string[];
  github_repo: string | null; // "owner/name"
  is_winner: boolean;
  prizes: string[];
  likes: number;

  liveness: Liveness;
  liveness_reason: string | null;
  gh_stars: number | null;
  gh_pushed_at: ISOTimestamp | null;
  gh_commits_after_event: number | null;

  domains: string[];
  stopped_at: string | null;
  updated_at?: ISOTimestamp;

  /** Joined through `project_members`. Hidden people are excluded. */
  team: Person[];
}

/** `agent_runs`: every agent / ingest step, including failures. */
export interface AgentRun {
  id: number | string;
  kind: string; // ingest.devpost, ingest.github, agent.search, agent.intro ...
  status: AgentRunStatus;
  input: unknown;
  output: unknown;
  error: string | null;
  created_at: ISOTimestamp;
}

export type DataSource = "supabase" | "json";

/* ------------------------------------------------------------------ */
/* Source selection                                                     */
/* ------------------------------------------------------------------ */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function supabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

let client: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  }
  return client;
}

/** The ingest output lives next to web/, in the repo's data/ folder. */
const DATA_DIR = path.join(process.cwd(), "..", "data");

/* ------------------------------------------------------------------ */
/* JSON fallback                                                        */
/* ------------------------------------------------------------------ */

type JsonPerson = Partial<Person> & { id: string };
type JsonProject = Partial<Omit<Project, "team">> & {
  id: string;
  slug: string;
  title: string;
  url: string;
  team?: JsonPerson[];
};
interface JsonSnapshot {
  events?: Partial<Event>[];
  projects?: JsonProject[];
}

function toPerson(p: JsonPerson): Person {
  return {
    id: p.id,
    devpost_username: p.devpost_username ?? null,
    name: p.name ?? null,
    devpost_url: p.devpost_url ?? null,
    avatar_url: p.avatar_url ?? null,
    github_login: p.github_login ?? null,
    claimed_by: p.claimed_by ?? null,
    hidden: p.hidden ?? false,
  };
}

function toProject(p: JsonProject): Project {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    tagline: p.tagline ?? null,
    description: p.description ?? null,
    url: p.url,
    thumbnail_url: p.thumbnail_url ?? null,
    event_id: p.event_id ?? null,
    submitted_at: p.submitted_at ?? null,
    built_with: p.built_with ?? [],
    links: p.links ?? [],
    github_repo: p.github_repo ?? null,
    is_winner: p.is_winner ?? false,
    prizes: p.prizes ?? [],
    likes: p.likes ?? 0,
    liveness: p.liveness ?? "unknown",
    liveness_reason: p.liveness_reason ?? null,
    gh_stars: p.gh_stars ?? null,
    gh_pushed_at: p.gh_pushed_at ?? null,
    gh_commits_after_event: p.gh_commits_after_event ?? null,
    domains: p.domains ?? [],
    stopped_at: p.stopped_at ?? null,
    team: (p.team ?? []).map(toPerson).filter((person) => !person.hidden),
  };
}

function toEvent(e: Partial<Event>): Event {
  return {
    id: e.id ?? "",
    source: e.source ?? "devpost",
    title: e.title ?? "",
    url: e.url ?? "",
    gallery_url: e.gallery_url ?? null,
    location: e.location ?? null,
    organization: e.organization ?? null,
    starts_on: e.starts_on ?? null,
    ends_on: e.ends_on ?? null,
    themes: e.themes ?? [],
    registrations: e.registrations ?? null,
  };
}

async function readJsonSnapshot(): Promise<{ events: Event[]; projects: Project[] }> {
  try {
    const raw = await readFile(path.join(DATA_DIR, "projects.json"), "utf8");
    const snap = JSON.parse(raw) as JsonSnapshot;
    return {
      events: (snap.events ?? []).map(toEvent),
      projects: (snap.projects ?? []).map(toProject),
    };
  } catch (err) {
    console.warn("[data] could not read ../data/projects.json:", err);
    return { events: [], projects: [] };
  }
}

async function readJsonAgentRuns(): Promise<AgentRun[]> {
  try {
    const raw = await readFile(path.join(DATA_DIR, "agent_runs.jsonl"), "utf8");
    return parseAgentRuns(raw);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Supabase                                                             */
/* ------------------------------------------------------------------ */

const PROJECT_COLUMNS = [
  "id", "slug", "title", "tagline", "description", "url", "thumbnail_url",
  "event_id", "submitted_at", "built_with", "links", "github_repo",
  "is_winner", "prizes", "likes", "liveness", "liveness_reason", "gh_stars",
  "gh_pushed_at", "gh_commits_after_event", "domains", "stopped_at",
  "updated_at",
].join(",");

const PERSON_COLUMNS =
  "id,devpost_username,name,devpost_url,avatar_url,github_login,claimed_by,hidden,updated_at";

async function readSupabaseSnapshot(): Promise<{ events: Event[]; projects: Project[] }> {
  const db = supabase();
  // `people` is embedded through the project_members join table. RLS only
  // returns people with hidden = false, so hidden members drop out (null).
  async function readPages(table: "events" | "projects", columns: string, order: string) {
    const rows: unknown[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await db.from(table).select(columns)
        .order(order, { ascending: false }).order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < pageSize) return rows;
    }
  }
  const [events, projects] = await Promise.all([
    readPages("events", "*", "starts_on"),
    readPages(
      "projects",
      `${PROJECT_COLUMNS}, project_members(person:people(${PERSON_COLUMNS}))`,
      "submitted_at",
    ),
  ]);

  type Row = Omit<Project, "team"> & {
    project_members: Array<{ person: Person | null }> | null;
  };
  return {
    events: (events as Partial<Event>[]).map(toEvent),
    projects: (projects as Row[]).map(({ project_members, ...rest }) => ({
      ...rest,
      team: (project_members ?? [])
        .map(({ person }) => person)
        .filter((person): person is Person => Boolean(person && !person.hidden)),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                           */
/* ------------------------------------------------------------------ */

export interface Snapshot {
  source: DataSource;
  events: Event[];
  projects: Project[];
}

/** Everything the map needs in one read. Falls back to JSON on any Supabase error. */
export async function getSnapshot(): Promise<Snapshot> {
  "use cache";
  cacheLife("minutes");

  if (supabaseConfigured()) {
    try {
      return { source: "supabase", ...(await readSupabaseSnapshot()) };
    } catch (err) {
      console.warn("[data] Supabase read failed, using ../data/projects.json:", err);
    }
  }
  return { source: "json", ...(await readJsonSnapshot()) };
}

export async function getDataSource(): Promise<DataSource> {
  return (await getSnapshot()).source;
}

export async function getEvents(): Promise<Event[]> {
  return (await getSnapshot()).events;
}

export async function getProjects(): Promise<Project[]> {
  return (await getSnapshot()).projects;
}

/** Look up by full id ("devpost:<slug>") or by slug. */
export async function getProject(idOrSlug: string): Promise<Project | null> {
  return findProject(await getProjects(), idOrSlug);
}

/** Distinct visible people across all project teams. */
export async function getPeople(): Promise<Person[]> {
  const byId = new Map<string, Person>();
  for (const project of await getProjects()) {
    for (const person of project.team) byId.set(person.id, person);
  }
  return [...byId.values()];
}

/** Newest first. Falls back to ../data/agent_runs.jsonl when Supabase isn't set. */
export async function getAgentRuns(limit = 50): Promise<AgentRun[]> {
  "use cache";
  cacheLife("minutes");

  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.min(1000, Math.floor(limit))) : 50;
  if (safeLimit === 0) return [];
  if (supabaseConfigured()) {
    try {
      const { data, error } = await supabase()
        .from("agent_runs").select("*")
        .order("created_at", { ascending: false }).limit(safeLimit);
      if (error) throw error;
      if (data) return data as AgentRun[];
    } catch (error) {
      console.warn("[data] Supabase agent_runs read failed, using local log:", error);
    }
  }
  return (await readJsonAgentRuns()).slice(0, safeLimit);
}
