"""Send projects to Cognee so it links projects, people, tools and events into a graph.

LLM / embedding settings come from the environment (LLM_PROVIDER, LLM_MODEL, LLM_API_KEY,
LLM_ENDPOINT, EMBEDDING_*). See .env.example.
"""

import asyncio

from .config import COGNEE_DATASET


def project_document(p: dict, events: dict[str, dict]) -> str:
    event = events.get(p.get("event_id")) or {}
    team = ", ".join(f"{m['name']} (devpost:{m['devpost_username']})" for m in p.get("team", [])) or "unknown"
    lines = [
        f"Project: {p['title']}",
        f"Tagline: {p.get('tagline') or ''}",
        f"Hackathon: {event.get('title', 'unknown')}, {event.get('location') or 'London'}, {event.get('ends_on') or 'date unknown'}",
        f"Organiser: {event.get('organization') or 'unknown'}",
        f"Built by: {team}",
        f"Built with: {', '.join(p.get('built_with') or []) or 'not listed'}",
        f"Status after the event: {p.get('liveness', 'unknown')} ({p.get('liveness_reason') or 'no data'})",
        f"GitHub: {p.get('github_repo') or 'none'}",
        f"Prizes: {'; '.join(p.get('prizes') or []) or 'none'}",
        f"Devpost: {p['url']}",
        f"Afterlife id: {p['id']}",
        "",
        p.get("description") or "",
    ]
    return "\n".join(lines)


async def _load(dataset: dict, cognify: bool) -> dict:
    import cognee

    events = {e["id"]: e for e in dataset["events"]}
    added = 0
    for p in dataset["projects"]:
        event = events.get(p.get("event_id")) or {}
        await cognee.add(
            project_document(p, events),
            dataset_name=COGNEE_DATASET,
            node_set=[s for s in ["project", event.get("title"), p.get("liveness")] if s],
        )
        added += 1
    if cognify:
        await cognee.cognify(datasets=[COGNEE_DATASET])
    return {"added": added, "cognified": cognify, "dataset": COGNEE_DATASET}


async def _search(query: str, top_k: int):
    import cognee
    from cognee import SearchType

    return await cognee.search(
        query_text=query,
        query_type=SearchType.GRAPH_COMPLETION,
        datasets=[COGNEE_DATASET],
        top_k=top_k,
    )


def load(dataset: dict, cognify: bool = True) -> dict:
    return asyncio.run(_load(dataset, cognify))


def search(query: str, top_k: int = 10):
    return asyncio.run(_search(query, top_k))
