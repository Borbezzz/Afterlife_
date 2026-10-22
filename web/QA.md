# Verification

The integrated app includes map/list exploration, impact lenses with quoted evidence, source-backed project briefs, graph-first search with labelled fallbacks, speaker shortlists, saved introduction drafts, profile consent and visibility, and operation logs. The white UI and neutral branding are preserved.

Remote regression fixes are retained: imported links reject credentials and unsafe schemes, project lookup checks literal identifiers before decoding, Supabase reads paginate, malformed JSONL records do not hide valid runs, and database failures fall back to the bundled archive/logs. Server traces include the public project, axes, impact, and brief snapshots.

## Repeat checks

Use Node 22.18+ (or newer with native TypeScript stripping).

```sh
cd web
node --test scripts/*.test.mjs tests/*.test.mjs
npm run lint
npm run build
AFTERLIFE_LOCAL_MODE=1 npm run start -- --hostname 127.0.0.1 --port 3100
# In another terminal:
QA_BASE_URL=http://127.0.0.1:3100 node tests/routes.mjs
```

The route check requests all 300 project pages, the seven application pages, the home redirect, an encoded full project ID, and missing routes. It checks HTTP output and evidence markup. The source-owning chats separately verified map interaction/full screen/filtering, project brief disclosure at mobile and desktop widths, introduction workflows, and profile visibility in the browser.

Tests isolate local state and mock upstream services. Live Cognee access, graph retrieval, Astra narration, and error handling were also checked by the backend chat; external graph processing can continue after code publication and is reported in the UI.

## Configuration limits

Supabase OAuth, Zero forwarding, and external services need their documented configuration. Direct Notion export and live event subscriptions are not implemented. Public deployment requires authenticated, owner-scoped storage before local workspace APIs are enabled. See the root README and `.env.local.example` for setup.

Local credential files, operation state, and generation caches are excluded from Git. The formerly tracked root `.env` is removed from the current tree; credentials from its earlier Git history still require rotation.
