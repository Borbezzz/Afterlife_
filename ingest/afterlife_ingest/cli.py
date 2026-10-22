"""afterlife-ingest: scrape -> enrich -> load.

  uv run afterlife-ingest scrape --max-projects 300
  uv run afterlife-ingest enrich
  uv run afterlife-ingest load-supabase
  uv run afterlife-ingest load-cognee
  uv run afterlife-ingest search "has anyone built a WhatsApp bot for events?"
"""

import argparse
import json
import sys

from . import devpost, github
from .config import PROJECTS_JSON
from .fetch import CachedClient, FetchError
from .runlog import log_run


def _read() -> dict:
    if not PROJECTS_JSON.exists():
        sys.exit(f"{PROJECTS_JSON} not found; run `scrape` first")
    return json.loads(PROJECTS_JSON.read_text())


def _write(dataset: dict):
    PROJECTS_JSON.parent.mkdir(parents=True, exist_ok=True)
    PROJECTS_JSON.write_text(json.dumps(dataset, indent=2, ensure_ascii=False))


def cmd_scrape(args):
    client = CachedClient(refresh=args.refresh)
    existing = {p["id"]: p for p in _read()["projects"]} if PROJECTS_JSON.exists() and not args.refresh else {}
    events, projects, failures = [], dict(existing), 0

    for event in devpost.list_london_hackathons(client, max_pages=args.max_hackathon_pages):
        if len(events) >= args.max_hackathons or len(projects) >= args.max_projects:
            break
        count = 0
        try:
            for entry in devpost.gallery_entries(client, event["gallery_url"]):
                if len(projects) >= args.max_projects:
                    break
                pid = "devpost:" + entry["url"].rstrip("/").rsplit("/", 1)[-1]
                if pid in projects:
                    continue
                try:
                    projects[pid] = devpost.scrape_project(client, entry, event)
                    count += 1
                except FetchError as e:
                    failures += 1
                    log_run("ingest.devpost.project", "failed", {"url": entry["url"]}, error=str(e))
        except FetchError as e:
            log_run("ingest.devpost.gallery", "failed", {"event": event["title"]}, error=str(e))
        print(f"  {event['title']:<50} {count:>3} projects", file=sys.stderr)
        if count or any(p.get("event_id") == event["id"] for p in projects.values()):
            events.append(event)
        else:
            log_run("ingest.devpost.gallery", "partial", {"event": event["title"]}, error="gallery empty or private")

    # Keep events from earlier runs that still have projects.
    if existing:
        prior = {e["id"]: e for e in _read()["events"]}
        known = {e["id"] for e in events}
        events += [e for eid, e in prior.items() if eid not in known]

    dataset = {"events": events, "projects": list(projects.values())}
    _write(dataset)
    status = "ok" if failures == 0 else "partial"
    summary = {"events": len(events), "projects": len(projects), "failed_pages": failures}
    log_run("ingest.devpost", status, {k: v for k, v in vars(args).items() if k != "func"}, summary)
    print(json.dumps(summary))


def cmd_enrich(args):
    client = CachedClient(min_interval=0.2 if github.GITHUB_TOKEN else 1.0)
    dataset = _read()
    events = {e["id"]: e for e in dataset["events"]}
    counts, status = {}, "ok"
    for i, p in enumerate(dataset["projects"]):
        if p.get("liveness") and p["liveness"] != "unknown" and not args.refresh:
            counts[p["liveness"]] = counts.get(p["liveness"], 0) + 1
            continue
        try:
            p.update(github.enrich(client, p, (events.get(p.get("event_id")) or {}).get("ends_on")))
        except FetchError as e:
            log_run("ingest.github", "failed", {"repo": p.get("github_repo")}, error=str(e))
            print(f"GitHub stopped at project {i}: {e}\nSet GITHUB_TOKEN for 5,000 req/hr; progress saved.", file=sys.stderr)
            status = "partial"
            break
        counts[p["liveness"]] = counts.get(p["liveness"], 0) + 1
        if i % 25 == 0:
            _write(dataset)
    _write(dataset)
    log_run("ingest.github", status, None, counts)
    print(json.dumps(counts))


def cmd_load_supabase(args):
    from .load_supabase import load

    print(json.dumps(load(_read())))


def cmd_load_cognee(args):
    from .load_cognee import load

    dataset = _read()
    if args.limit:
        dataset["projects"] = dataset["projects"][: args.limit]
    try:
        result = load(dataset, cognify=not args.no_cognify)
    except Exception as e:
        log_run("ingest.cognee", "failed", {"limit": args.limit}, error=repr(e))
        raise
    log_run("ingest.cognee", "ok", {"limit": args.limit}, result)
    print(json.dumps(result))


def cmd_search(args):
    from .load_cognee import search

    for r in search(args.query, args.top_k):
        print(r)


def main():
    ap = argparse.ArgumentParser(prog="afterlife-ingest")
    sub = ap.add_subparsers(required=True)

    s = sub.add_parser("scrape", help="Devpost London hackathons -> data/projects.json")
    s.add_argument("--max-projects", type=int, default=300)
    s.add_argument("--max-hackathons", type=int, default=60)
    s.add_argument("--max-hackathon-pages", type=int, default=30, help="9 hackathons per API page")
    s.add_argument("--refresh", action="store_true", help="ignore the on-disk cache")
    s.set_defaults(func=cmd_scrape)

    s = sub.add_parser("enrich", help="GitHub liveness for each project")
    s.add_argument("--refresh", action="store_true")
    s.set_defaults(func=cmd_enrich)

    s = sub.add_parser("load-supabase", help="upsert events, people, projects, agent runs")
    s.set_defaults(func=cmd_load_supabase)

    s = sub.add_parser("load-cognee", help="add projects to Cognee and cognify")
    s.add_argument("--limit", type=int)
    s.add_argument("--no-cognify", action="store_true")
    s.set_defaults(func=cmd_load_cognee)

    s = sub.add_parser("search", help="query the Cognee graph")
    s.add_argument("query")
    s.add_argument("--top-k", type=int, default=10)
    s.set_defaults(func=cmd_search)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
