import assert from "node:assert/strict";
import test from "node:test";

import { githubProfileUrl, githubRepositoryUrl } from "../lib/urls.ts";

test("GitHub evidence links require a repository path instead of an arbitrary imported URL", () => {
  assert.equal(githubRepositoryUrl("Borbezzz/Afterlife"), "https://github.com/Borbezzz/Afterlife");
  for (const value of [null, "https://github.com/org/repo", "org/repo/", "org/repo//extra", "../repo", "org/..", "org/%2e%2e", "org/repo?token=secret"]) {
    assert.equal(githubRepositoryUrl(value), null);
  }
});

test("GitHub profile links cannot add paths, query strings or credentials", () => {
  assert.equal(githubProfileUrl("some-builder"), "https://github.com/some-builder");
  for (const value of [null, "../settings", "user@host", "user/extra", "user?token=secret", "-user"]) {
    assert.equal(githubProfileUrl(value), null);
  }
});
