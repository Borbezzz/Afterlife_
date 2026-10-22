"""Append-only log of what each step tried and where it failed.

Written locally to data/agent_runs.jsonl and pushed to Supabase `agent_runs` by the loader,
so the app can show failures instead of hiding them.
"""

import json
from datetime import datetime, timezone

from .config import RUNS_LOG


def log_run(kind: str, status: str, input=None, output=None, error: str | None = None):
    RUNS_LOG.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "kind": kind,
        "status": status,
        "input": input,
        "output": output,
        "error": error,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    with RUNS_LOG.open("a") as f:
        f.write(json.dumps(entry) + "\n")
