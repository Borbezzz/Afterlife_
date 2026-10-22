"""Polite HTTP with an on-disk cache, so every ingest step is re-runnable offline."""

import hashlib
import json
import time

import httpx

from .config import BROWSER_UA, CACHE_DIR


class FetchError(Exception):
    pass


class CachedClient:
    def __init__(self, min_interval: float = 0.5, refresh: bool = False):
        self.min_interval = min_interval
        self.refresh = refresh
        self._last = 0.0
        self._http = httpx.Client(
            headers={"User-Agent": BROWSER_UA},
            follow_redirects=True,
            timeout=30,
        )
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    def _path(self, url: str, kind: str):
        digest = hashlib.sha256(url.encode()).hexdigest()[:24]
        return CACHE_DIR / f"{digest}.{kind}"

    def _get(self, url: str, headers: dict | None, kind: str, max_age: float | None) -> str:
        path = self._path(url, kind)
        if path.exists() and not self.refresh:
            if max_age is None or time.time() - path.stat().st_mtime < max_age:
                return path.read_text()

        wait = self.min_interval - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        for attempt in range(3):
            self._last = time.monotonic()
            resp = self._http.get(url, headers=headers)
            if resp.status_code == 429 or resp.status_code >= 500:
                time.sleep(2 ** (attempt + 1))
                continue
            break
        if resp.status_code == 404:
            raise FetchError(f"404 {url}")
        if resp.status_code >= 400:
            raise FetchError(f"{resp.status_code} {url}: {resp.text[:200]}")
        path.write_text(resp.text)
        return resp.text

    def html(self, url: str, max_age: float | None = None) -> str:
        return self._get(url, None, "html", max_age)

    def json(self, url: str, headers: dict | None = None, max_age: float | None = None):
        return json.loads(self._get(url, {"Accept": "application/json", **(headers or {})}, "json", max_age))
