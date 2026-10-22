-- Afterlife core schema: London hack projects, the people behind them, and the
-- consent / outreach / agent-log tables the app writes to.

create extension if not exists vector;

-- Hackathons (Devpost challenges, later also Luma events)
create table if not exists events (
  id              text primary key,            -- "devpost:<hackathon id>"
  source          text not null default 'devpost',
  title           text not null,
  url             text not null,
  gallery_url     text,
  location        text,
  organization    text,
  starts_on       date,
  ends_on         date,
  themes          text[] not null default '{}',
  registrations   integer,
  raw             jsonb,
  updated_at      timestamptz not null default now()
);

-- Builders. Unclaimed rows hold public Devpost data only.
create table if not exists people (
  id              text primary key,            -- "devpost:<username>"
  devpost_username text unique,
  name            text,
  devpost_url     text,
  avatar_url      text,
  github_login    text,
  claimed_by      uuid references auth.users(id) on delete set null,
  hidden          boolean not null default false,   -- opt-out: hide from map and search
  updated_at      timestamptz not null default now()
);

create table if not exists projects (
  id              text primary key,            -- "devpost:<slug>"
  slug            text not null unique,
  title           text not null,
  tagline         text,
  description     text,                        -- story markdown-ish text, truncated
  url             text not null,
  thumbnail_url   text,
  event_id        text references events(id) on delete set null,
  submitted_at    timestamptz,
  built_with      text[] not null default '{}',
  links           text[] not null default '{}',
  github_repo     text,                        -- "owner/name"
  is_winner       boolean not null default false,
  prizes          text[] not null default '{}',
  likes           integer not null default 0,

  -- liveness from GitHub
  liveness        text not null default 'unknown' check (liveness in ('alive','dormant','dead','unknown')),
  liveness_reason text,
  gh_stars        integer,
  gh_pushed_at    timestamptz,
  gh_commits_after_event integer,

  -- enrichment (Grok tags, 3D layout)
  domains         text[] not null default '{}',
  stopped_at      text,                        -- one-line "where it stopped"
  embedding       vector(1536),

  raw             jsonb,
  updated_at      timestamptz not null default now()
);

create index if not exists projects_event_idx on projects(event_id);
create index if not exists projects_liveness_idx on projects(liveness);
create index if not exists projects_built_with_idx on projects using gin(built_with);

create table if not exists project_members (
  project_id      text references projects(id) on delete cascade,
  person_id       text references people(id) on delete cascade,
  primary key (project_id, person_id)
);

-- Opt-in questionnaire (Track 2: "a few quick questions")
create table if not exists questionnaire_answers (
  id              bigint generated always as identity primary key,
  person_id       text references people(id) on delete cascade,
  building_now    text,
  want_to_meet    text,
  open_to_speaking boolean,
  topics          text[] not null default '{}',
  created_at      timestamptz not null default now()
);

create table if not exists consent (
  person_id       text primary key references people(id) on delete cascade,
  show_on_map     boolean not null default true,
  allow_intros    boolean not null default false,
  allow_speaking  boolean not null default false,
  updated_at      timestamptz not null default now()
);

-- Drafted intros. Never auto-sent; a human pushes them to Zero.
create table if not exists intro_drafts (
  id              uuid primary key default gen_random_uuid(),
  requested_by    uuid references auth.users(id) on delete set null,
  to_person_id    text references people(id) on delete cascade,
  about_project_id text references projects(id) on delete set null,
  reason          text,
  evidence        jsonb not null default '[]',
  body            text not null,
  status          text not null default 'draft' check (status in ('draft','sent_to_zero','discarded')),
  zero_ref        text,
  created_at      timestamptz not null default now()
);

-- Every agent / ingest step, including failures (shown in the UI).
create table if not exists agent_runs (
  id              bigint generated always as identity primary key,
  kind            text not null,               -- ingest.devpost, ingest.github, agent.search, agent.intro ...
  status          text not null check (status in ('ok','partial','failed')),
  input           jsonb,
  output          jsonb,
  error           text,
  created_at      timestamptz not null default now()
);

-- Row level security: the map is public read; writes go through the service role.
alter table events                enable row level security;
alter table people                enable row level security;
alter table projects              enable row level security;
alter table project_members       enable row level security;
alter table questionnaire_answers enable row level security;
alter table consent               enable row level security;
alter table intro_drafts          enable row level security;
alter table agent_runs            enable row level security;

create policy "public read events"   on events          for select using (true);
create policy "public read projects" on projects        for select using (true);
create policy "public read members"  on project_members for select using (true);
create policy "public read agent runs" on agent_runs    for select using (true);
create policy "public read visible people" on people    for select using (not hidden);

create policy "claimer updates own person" on people
  for update using (claimed_by = auth.uid()) with check (claimed_by = auth.uid());
create policy "claimer manages own consent" on consent
  for all using (person_id in (select id from people where claimed_by = auth.uid()))
  with check (person_id in (select id from people where claimed_by = auth.uid()));
create policy "claimer manages own answers" on questionnaire_answers
  for all using (person_id in (select id from people where claimed_by = auth.uid()))
  with check (person_id in (select id from people where claimed_by = auth.uid()));
create policy "requester reads own drafts" on intro_drafts
  for select using (requested_by = auth.uid());

-- Live stars on stage
alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table agent_runs;
