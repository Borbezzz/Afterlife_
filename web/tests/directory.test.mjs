import test from 'node:test';
import assert from 'node:assert/strict';
import { searchProjects, directoryProjects } from '../lib/search.ts';
import { escapeHtml } from '../lib/text.ts';
import { safeExternalUrl } from '../lib/urls.ts';

const project = (id, title, extra = {}) => ({
  id, slug: id, title, description: '', tagline: null, built_with: [], domains: [],
  team: [], liveness: 'unknown', url: 'https://devpost.com/software/test', ...extra,
});

test('keyword search weights title and stack evidence above description and supports Unicode', () => {
  const projects = [project('body', 'Other', { description: 'A voice agent' }), project('title', 'Voice'), project('stack', 'Tool', { built_with: ['voice'] }), project('unicode', '気候')];
  assert.deepEqual(searchProjects(projects, 'VOICE').map(p => p.id), ['stack', 'title', 'body']);
  assert.deepEqual(searchProjects(projects, '気候').map(p => p.id), ['unicode']);
  assert.equal(searchProjects(projects, 'missing').length, 0);
  assert.equal(searchProjects(projects, '   ').length, 4);
});

test('directory excludes hidden people and private account fields', () => {
  const projects = directoryProjects([project('one', 'One', { team: [
    { id: 'visible', name: 'Visible', hidden: false, claimed_by: 'private-user-id' },
    { id: 'hidden', name: 'Hidden', hidden: true },
  ] })]);
  assert.deepEqual(projects[0].team.map(p => p.id), ['visible']);
  assert.equal('claimed_by' in projects[0].team[0], false);
});

test('tooltips render hostile imported titles as text', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)"> & \'x\''), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;x&#39;');
});

test('external links accept only credential-free HTTP(S) URLs', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', '//evil.test', 'https://user:secret@example.com', 'bad', null]) {
    assert.equal(safeExternalUrl(url), null);
  }
  assert.equal(safeExternalUrl('https://example.com/proof'), 'https://example.com/proof');
});

const { findProject, parseAgentRuns } = await import('../lib/records.ts');

test('project lookup preserves literal percent sequences and accepts encoded full ids', () => {
  const projects = [{ id: 'devpost:foo%2Fbar', slug: 'foo%2Fbar' }, { id: 'devpost:foo/bar', slug: 'foo/bar' }, { id: 'devpost:100%', slug: '100%' }];
  assert.equal(findProject(projects, 'foo%2Fbar'), projects[0]);
  assert.equal(findProject(projects, 'devpost%3Afoo%2Fbar'), projects[1]);
  assert.equal(findProject(projects, '100%'), projects[2]);
  assert.equal(findProject(projects, '%broken'), null);
});

test('a truncated or malformed log record does not hide successful runs', () => {
  const raw = '{"kind":"first","status":"ok","created_at":"2026-01-01"}\nnull\n[]\n{"kind":"second","status":"partial","created_at":"2026-10-22"}\n{"kind":';
  assert.deepEqual(parseAgentRuns(raw).map(run => run.kind), ['second', 'first']);
  assert.deepEqual(parseAgentRuns('{"kind":{},"created_at":12}')[0], { id: 'local-0', kind: 'unknown', status: 'failed', input: null, output: null, error: null, created_at: '' });
});
