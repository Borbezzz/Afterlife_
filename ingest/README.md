# afterlife-ingest

Scrapes London hackathon projects from Devpost, checks GitHub for whether each one kept going, and loads the result into Supabase and Cognee.

```
Devpost hackathons API (search=london, filtered by venue) ─► project galleries ─► project pages
                                                                    │
                                    GitHub repo + commits since event week ─► liveness
                                                                    │
                                              data/projects.json ──┬─► Supabase (load-supabase)
                                                                    └─► Cognee   (load-cognee)
```

## Run

```bash
cp ../.env.example ../.env        # fill in keys
uv sync
uv run afterlife-ingest scrape --max-projects 300
uv run afterlife-ingest enrich    # needs GITHUB_TOKEN for more than ~30 repos/hour
uv run afterlife-ingest load-supabase
uv run afterlife-ingest load-cognee
uv run afterlife-ingest search "has anyone built a WhatsApp bot for community events?"
```

Apply `../supabase/migrations/0001_init.sql` to your Supabase project first (SQL editor, or `supabase db push`).

Every fetch is cached in `data/cache/`, so re-runs are cheap and work offline; pass `--refresh` to refetch. Each step appends what it tried, and where it failed, to `data/agent_runs.jsonl`. `load-supabase` uploads that log to the `agent_runs` table for the app to show.

## Liveness

| Status | Rule |
|---|---|
| alive | pushed to GitHub in the last 60 days, and after event week (for events under 2 weeks old: any push after the event) |
| dormant | kept pushing after event week, then stopped; or a recent event with no pushes since |
| dead | no pushes after event week, or the repo was deleted or made private |
| unknown | no public GitHub repo linked on Devpost |

## Notes

- Hackathons count as London when the title or venue matches `LONDON_MARKERS` (see `config.py`). Some galleries are private and get logged as `gallery empty or private`.
- Devpost needs a browser User-Agent. The fetcher waits 0.5s between requests.
- Public data only. Keep anything shared privately (e.g. Luma exports) in `data/private/`, which is gitignored.
