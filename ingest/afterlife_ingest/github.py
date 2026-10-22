"""GitHub liveness: did the project keep going after the hackathon?"""

from datetime import date, datetime, timedelta, timezone

from .config import GITHUB_TOKEN
from .fetch import CachedClient, FetchError

API = "https://api.github.com"
EVENT_GRACE = timedelta(days=14)   # commits within two weeks of the event still count as hackathon work
ALIVE_WINDOW = timedelta(days=60)
HOUR = 3600


def _headers():
    h = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if GITHUB_TOKEN:
        h["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return h


def classify(pushed_at: datetime | None, event_end: date | None, now: datetime) -> tuple[str, str]:
    if pushed_at is None:
        return "dead", "repo has no pushes"
    if event_end is None:
        if now - pushed_at < ALIVE_WINDOW:
            return "alive", f"last push {pushed_at.date()} (event date unknown)"
        return "dormant", f"last push {pushed_at.date()} (event date unknown)"

    cutoff = datetime.combine(event_end, datetime.min.time(), tzinfo=timezone.utc) + EVENT_GRACE
    if now < cutoff:
        # Event was in the last two weeks: any push after it ended counts as momentum.
        ended = datetime.combine(event_end, datetime.min.time(), tzinfo=timezone.utc)
        if pushed_at > ended + timedelta(days=1):
            return "alive", f"pushed {pushed_at.date()}, after the event ended"
        return "dormant", "no pushes since the event (event was recent)"
    if pushed_at <= cutoff:
        return "dead", f"no pushes after event week (last {pushed_at.date()})"
    if now - pushed_at < ALIVE_WINDOW:
        return "alive", f"still shipping: last push {pushed_at.date()}"
    return "dormant", f"kept going after the event, then stopped ({pushed_at.date()})"


def enrich(client: CachedClient, project: dict, event_end: str | None, now: datetime | None = None) -> dict:
    """Return liveness fields for a project. Raises FetchError only on rate limits."""
    now = now or datetime.now(timezone.utc)
    repo = project.get("github_repo")
    if not repo:
        return {"liveness": "unknown", "liveness_reason": "no public GitHub repo linked"}

    end = date.fromisoformat(event_end) if event_end else None
    try:
        info = client.json(f"{API}/repos/{repo}", headers=_headers(), max_age=12 * HOUR)
    except FetchError as e:
        if str(e).startswith("404"):
            return {"liveness": "dead", "liveness_reason": f"repo {repo} deleted or private"}
        raise

    pushed_at = datetime.fromisoformat(info["pushed_at"].replace("Z", "+00:00")) if info.get("pushed_at") else None
    liveness, reason = classify(pushed_at, end, now)

    commits_after = None
    if end:
        since = (datetime.combine(end, datetime.min.time(), tzinfo=timezone.utc) + EVENT_GRACE).isoformat()
        try:
            commits = client.json(
                f"{API}/repos/{repo}/commits?since={since}&per_page=100", headers=_headers(), max_age=12 * HOUR
            )
            commits_after = len(commits) if isinstance(commits, list) else None
        except FetchError as e:
            if not str(e).startswith(("404", "409")):  # 409 = empty repo
                raise

    return {
        "github_repo": info.get("full_name", repo),
        "liveness": liveness,
        "liveness_reason": reason,
        "gh_stars": info.get("stargazers_count"),
        "gh_pushed_at": info.get("pushed_at"),
        "gh_commits_after_event": commits_after,
    }
