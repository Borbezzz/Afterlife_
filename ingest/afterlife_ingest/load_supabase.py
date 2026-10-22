"""Upsert data/projects.json into Supabase (service role; run the migration first)."""

import json

from supabase import create_client

from .config import RUNS_LOG, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

PROJECT_COLUMNS = [
    "id", "slug", "title", "tagline", "description", "url", "thumbnail_url", "event_id",
    "submitted_at", "built_with", "links", "github_repo", "is_winner", "prizes", "likes",
    "liveness", "liveness_reason", "gh_stars", "gh_pushed_at", "gh_commits_after_event",
]
EVENT_COLUMNS = [
    "id", "source", "title", "url", "gallery_url", "location", "organization",
    "starts_on", "ends_on", "themes", "registrations",
]
PERSON_COLUMNS = ["id", "devpost_username", "name", "devpost_url", "avatar_url"]


def _chunks(rows, size=200):
    for i in range(0, len(rows), size):
        yield rows[i : i + size]


def load(dataset: dict) -> dict:
    if not (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY):
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env")
    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    events = [{k: e.get(k) for k in EVENT_COLUMNS} | {"raw": e} for e in dataset["events"]]
    people = {}
    members = []
    projects = []
    for p in dataset["projects"]:
        projects.append({k: p.get(k) for k in PROJECT_COLUMNS} | {"raw": {"submissions": p.get("submissions")}})
        for person in p.get("team", []):
            people[person["id"]] = {k: person.get(k) for k in PERSON_COLUMNS}
            members.append({"project_id": p["id"], "person_id": person["id"]})

    for rows in _chunks(events):
        sb.table("events").upsert(rows).execute()
    for rows in _chunks(list(people.values())):
        # Don't overwrite claimed/hidden flags set by builders themselves.
        sb.table("people").upsert(rows, on_conflict="id").execute()
    for rows in _chunks(projects):
        sb.table("projects").upsert(rows).execute()
    for rows in _chunks(members):
        sb.table("project_members").upsert(rows, ignore_duplicates=True).execute()

    runs = 0
    if RUNS_LOG.exists():
        lines = [json.loads(line) for line in RUNS_LOG.read_text().splitlines() if line.strip()]
        for rows in _chunks(lines):
            sb.table("agent_runs").insert(rows).execute()
        runs = len(lines)
        RUNS_LOG.rename(RUNS_LOG.with_suffix(".jsonl.uploaded"))

    return {"events": len(events), "people": len(people), "projects": len(projects), "members": len(members), "agent_runs": runs}
