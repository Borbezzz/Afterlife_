"""Devpost: London hackathons -> project galleries -> project pages.

Devpost has no public API for galleries or project pages, so those are parsed from HTML.
Selectors were checked against live pages on 22 Oct 2026.
"""

import re
from datetime import date, datetime
from urllib.parse import urljoin

from selectolax.lexbor import LexborHTMLParser as HTMLParser

from .config import LONDON_MARKERS
from .fetch import CachedClient

HACKATHONS_API = "https://devpost.com/api/hackathons"
GITHUB_REPO_RE = re.compile(r"github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)")
GITHUB_NON_REPO_OWNERS = {"orgs", "sponsors", "topics", "features", "marketplace", "settings", "apps"}
DAY = 24 * 3600


def is_london(hackathon: dict) -> bool:
    loc = (hackathon.get("displayed_location") or {}).get("location") or ""
    haystack = f"{hackathon.get('title', '')} {loc}".lower()
    return any(marker in haystack for marker in LONDON_MARKERS)


def parse_period(text: str) -> tuple[date | None, date | None]:
    """'Apr 09 - 10, 2016' | 'Sep 12, 2026' | 'Dec 30, 2025 - Jan 02, 2026' -> (start, end)."""
    if not text:
        return None, None
    parts = [p.strip() for p in text.split(" - ")]
    try:
        end_txt = parts[-1]
        year = int(end_txt[-4:])
        start_txt = parts[0]
        start_month = start_txt.split()[0]
        if not re.match(r"[A-Za-z]{3}", end_txt):  # '10, 2016'
            end_txt = f"{start_month} {end_txt}"
        end = datetime.strptime(end_txt, "%b %d, %Y").date()
        if re.search(r"\d{4}$", start_txt):
            start = datetime.strptime(start_txt, "%b %d, %Y").date()
        else:
            start = datetime.strptime(f"{start_txt}, {year}", "%b %d, %Y").date()
            if start > end:
                start = start.replace(year=year - 1)
        return start, end
    except (ValueError, IndexError):
        return None, None


def list_london_hackathons(client: CachedClient, max_pages: int = 30, status: str = "ended"):
    """Yield London hackathons from the Devpost search API, newest first."""
    for page in range(1, max_pages + 1):
        url = f"{HACKATHONS_API}?status[]={status}&search=london&order_by=recently-added&page={page}"
        data = client.json(url, max_age=DAY)
        hackathons = data.get("hackathons") or []
        if not hackathons:
            return
        for h in hackathons:
            if is_london(h):
                start, end = parse_period(h.get("submission_period_dates", ""))
                yield {
                    "id": f"devpost:{h['id']}",
                    "source": "devpost",
                    "title": h["title"].strip(),
                    "url": h["url"],
                    "gallery_url": h.get("submission_gallery_url") or urljoin(h["url"], "project-gallery"),
                    "location": (h.get("displayed_location") or {}).get("location"),
                    "organization": h.get("organization_name"),
                    "starts_on": start.isoformat() if start else None,
                    "ends_on": end.isoformat() if end else None,
                    "themes": [t["name"] for t in h.get("themes") or []],
                    "registrations": h.get("registrations_count"),
                }


def gallery_entries(client: CachedClient, gallery_url: str, max_pages: int = 20):
    """Yield the lightweight card data for every project in a hackathon gallery."""
    seen = set()
    for page in range(1, max_pages + 1):
        tree = HTMLParser(client.html(f"{gallery_url}?page={page}", max_age=DAY))
        items = tree.css("div.gallery-item")
        if not items:
            return
        new = 0
        for item in items:
            link = item.css_first("a.link-to-software")
            if not link:
                continue
            url = link.attributes.get("href", "").split("?")[0]
            if url in seen:
                continue
            seen.add(url)
            new += 1
            likes = item.css_first('span[data-count="like"]')
            thumb = item.css_first("img.software_thumbnail_image")
            yield {
                "url": url,
                "is_winner": item.css_first("img.winner") is not None,
                "likes": int(likes.text(strip=True) or 0) if likes else 0,
                "thumbnail_url": _abs(thumb.attributes.get("src")) if thumb else None,
            }
        if new == 0 or not tree.css_first('.pagination a[rel="next"]'):
            return


def _abs(url: str | None) -> str | None:
    return f"https:{url}" if url and url.startswith("//") else url


def _github_repo(urls: list[str]) -> str | None:
    for u in urls:
        m = GITHUB_REPO_RE.search(u)
        if m and m.group(1).lower() not in GITHUB_NON_REPO_OWNERS:
            return f"{m.group(1)}/{m.group(2).removesuffix('.git')}"
    return None


def parse_project(html: str, url: str) -> dict:
    tree = HTMLParser(html)
    slug = url.rstrip("/").rsplit("/", 1)[-1]

    title_node = tree.css_first("#app-title")
    tagline_node = tree.css_first("#software-header p.large")

    built_with = [n.text(strip=True) for n in tree.css("#built-with .cp-tag")]
    links = [a.attributes.get("href") for a in tree.css('ul[data-role="software-urls"] a') if a.attributes.get("href")]

    details = tree.css_first("#app-details-left")
    story_links = []
    description = ""
    if details:
        story_links = [a.attributes.get("href") for a in details.css("a") if a.attributes.get("href")]
        for sel in ("#gallery", "#built-with", "nav.app-links"):
            for n in details.css(sel):
                n.decompose()
        description = re.sub(r"\n{3,}", "\n\n", details.text(separator="\n", strip=True)).strip()[:8000]

    team = []
    for li in tree.css("#app-team li.software-team-member"):
        links_in = li.css("a.user-profile-link")
        if not links_in:
            continue
        profile = links_in[0].attributes.get("href", "")
        username = profile.rstrip("/").rsplit("/", 1)[-1]
        name = links_in[-1].text(strip=True) or username
        img = li.css_first("img")
        team.append({
            "id": f"devpost:{username}",
            "devpost_username": username,
            "name": name,
            "devpost_url": profile,
            "avatar_url": _abs(img.attributes.get("src")) if img else None,
        })

    submissions = []
    for content in tree.css("#submissions .software-list-content"):
        a = content.css_first("p a")
        prizes = [
            re.sub(r"^\s*Winner\s*", "", li.text(separator=" ", strip=True)).strip()
            for li in content.css("li")
            if li.css_first("span.winner")
        ]
        submissions.append({
            "hackathon_url": a.attributes.get("href") if a else None,
            "hackathon_title": a.text(strip=True) if a else None,
            "prizes": prizes,
        })

    first_update = tree.css_first("time.timeago")

    return {
        "id": f"devpost:{slug}",
        "slug": slug,
        "title": title_node.text(strip=True) if title_node else slug,
        "tagline": tagline_node.text(strip=True) if tagline_node else None,
        "description": description,
        "url": url,
        "built_with": built_with,
        "links": links,
        "github_repo": _github_repo(links + story_links),
        "team": team,
        "submissions": submissions,
        "submitted_at": first_update.attributes.get("datetime") if first_update else None,
    }


def scrape_project(client: CachedClient, entry: dict, event: dict) -> dict:
    project = parse_project(client.html(entry["url"]), entry["url"])
    prizes = [
        p
        for s in project["submissions"]
        if s["hackathon_url"] and s["hackathon_url"].rstrip("/") == event["url"].rstrip("/")
        for p in s["prizes"]
    ]
    project.update(
        event_id=event["id"],
        thumbnail_url=entry.get("thumbnail_url"),
        likes=entry.get("likes", 0),
        prizes=prizes,
        is_winner=entry.get("is_winner", False) or bool(prizes),
    )
    return project
