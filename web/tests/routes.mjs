// Run against `npm run start -- --port 3100` after a production build.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const origin = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3100';
const snapshot = JSON.parse(await readFile(new URL('../../data/projects.json', import.meta.url), 'utf8'));
const routes = ['/explore', '/before-you-build', '/speakers', '/intros', '/log', '/claim', '/_kitchen-sink', ...snapshot.projects.map(p => `/p/${encodeURIComponent(p.slug)}`)];
for (let offset = 0; offset < routes.length; offset += 10) {
  await Promise.all(routes.slice(offset, offset + 10).map(async route => {
    const response = await fetch(new URL(route, origin));
    const html = await response.text();
    assert.equal(response.status, 200, route);
    assert.ok(/<main\b/.test(html), `${route}: missing application content`);
    // The introductions client reads URL search parameters behind Suspense;
    // its heading is hydrated in the browser rather than in the static shell.
    assert.ok(route === '/intros' ? /<h1\b|Loading intro drafts/.test(html) : /<h1\b/.test(html), `${route}: missing heading or expected client shell`);
    if (route.startsWith('/p/')) assert.ok(/id="project-evidence"/.test(html), `${route}: missing evidence`);
  }));
}
const home = await fetch(new URL('/', origin), { redirect: 'manual' });
assert.equal(home.status, 307);
assert.equal(home.headers.get('location'), '/explore');
const fullId = await fetch(new URL(`/p/${encodeURIComponent(snapshot.projects[0].id)}`, origin));
assert.equal(fullId.status, 200);
assert.match(await fullId.text(), /id="project-evidence"/);
for (const route of ['/p/missing-project-qa', '/p/100%25', '/missing-page-qa']) {
  const response = await fetch(new URL(route, origin));
  assert.notEqual(response.status, 500, route);
  const html = await response.text();
  assert.match(html, /Page not found/, route);
  assert.match(html, /name="robots" content="noindex"/, route);
}
console.log(`${routes.length} pages, home redirect, full project ID and three missing-route cases passed.`);
