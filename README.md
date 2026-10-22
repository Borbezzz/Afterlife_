# Afterlife

Afterlife is a searchable memory of London hackathon projects: what was built, by whom, and how far each project has progressed.

## Run the web app

```sh
cd web
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app redirects to `/explore` and reads the bundled `data/projects.json` snapshot by default.

## What works locally

- **Explore:** 300 public projects, evidence panels, map/list views, liveness filters, selectable 3D lenses, and an archive assistant that highlights projects and changes the map.
- **Before you build:** Cognee relationship retrieval with canonical source links and Astra summaries; OpenAI semantic retrieval provides a labelled fallback.
- **Speakers:** evidence-backed builder suggestions, shortlist selection, and CSV export.
- **Intros:** create, edit, save, copy, and download introduction drafts. Messages are never sent automatically.
- **Claim:** consent, questionnaire, speaking preferences, and discovery visibility. GitHub ownership verification requires configured Supabase Auth.
- **Log:** actual search, draft, export, and failure records.

Cognee retrieves project and builder relationships from the scoped public archive. The app uses OpenAI Responses for grounded narration: `gpt-6-astra` for Cognee results, map classification and the relationship assistant, `gpt-6.1-sol` for fallback summaries and drafts, and `text-embedding-3-small` for fallback semantic retrieval. CopilotKit provides the assistant's tool transport. Search results report retrieval provenance independently from whether an AI summary succeeded.

## Configuration

Copy `web/.env.local.example` to `web/.env.local`, then set `OPENAI_API_KEY`. Keep it server-side; do not add a `NEXT_PUBLIC_` prefix. Without it, evidence search and drafting retain an explicitly labelled local fallback.

For Cognee Cloud, also set `COGNEE_API_KEY`, `COGNEE_API_URL` and `COGNEE_DATASET` (default `afterlife`). `OPENAI_RELATIONSHIP_MODEL` defaults to `gpt-6-astra`; `COGNEE_TIMEOUT_MS` defaults to 12000 and is capped at 30000. Credentials are never returned to the browser. From the repository root, seed the public archive and check graph processing:

```sh
node scripts/sync-cognee.mjs --dry-run
node scripts/sync-cognee.mjs
node scripts/sync-cognee.mjs --status
```

Add `--wait` to sync or status to wait for graph processing. Sync is resumable using an ignored local manifest and uploads only new or changed public project records. It excludes hidden builders and local discovery opt-outs; private claim answers and introduction drafts are not uploaded. It never deletes existing tenant data. To remove an earlier upload from Cognee itself, delete it through the tenant's dataset controls; local opt-outs still prevent that project's retrieval results from being returned by this app.

`GET /api/cognee` verifies authenticated access to the configured dataset and reports graph processing progress when available; it is restricted to the local workspace. Authenticated access does not mean graph processing has finished. Search/chat/speakers and CopilotKit tools use the same graph retrieval path, then resolve results against visible canonical project records. Unrelated tenant datasets and prompt/history echoes are not accepted as evidence. If Cognee is unavailable or returns no resolvable references, the response labels the semantic or local fallback. Results also flag an incomplete graph while processing continues. The archive currently establishes builder/project/event relationships, not verified investor or funding relationships.

`data/project-axes.json` contains the generated Astra classifications for all 300 projects. To regenerate them after changing the public dataset:

```sh
node scripts/generate-axes.mjs
```

The map labels are model inferences from public evidence, not verified funding or investment ratings. Raw liveness comes from the dataset's GitHub checks. The map includes a usable list when WebGL is unavailable.

Project descriptions use a short product sentence and up to three feature bullets in both the map and project pages. The full author write-up remains available under “Read full project write-up,” with its original sections and paragraphs. Briefs are prepared offline, so opening a node never calls a model:

```sh
node web/scripts/generate-project-briefs.mjs
```

The generator uses `OPENAI_API_KEY` and optional `OPENAI_BRIEF_MODEL` (default `gpt-6-luna`). It resumes from matching cached results, validates length limits and verbatim supporting quotes, and writes `data/project-briefs.json` atomically. Source hashes invalidate briefs when a project's title, tagline, or description changes. New, changed, or uncached records use a local section-based brief until regeneration. The writing rules follow [YC's guidance on clear product descriptions](https://www.ycombinator.com/howtoapply/): explain what the product does first, using simple, specific language.

The semantic index is cached automatically under ignored `data/local/`. `POST /api/search-index` warms it and `GET /api/search-index` reports readiness. Drafts, preferences, and operation logs also persist in `data/local/`; keep that directory on a persistent volume if hosting the app.

### Optional services

- **Supabase:** set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, apply the schema in `supabase/`, enable GitHub OAuth, and allow the app's `/claim` callback URL. Project reads fall back to the bundled snapshot on a database failure. Public builder records need a matching GitHub identity for verified claims.
- **Zero:** draft forwarding requires a verified draft endpoint in `ZERO_DRAFT_ENDPOINT` and optionally `ZERO_API_KEY`. Without one, the UI reports unavailable. This app never invokes automatic sending.
- **Notion:** CSV export works locally. Direct Notion export is not implemented and is explicitly unavailable.
- **Cognee:** the running app uses the cloud HTTP API; `scripts/sync-cognee.mjs` imports the public snapshot. The original local Python pipeline remains in `ingest/`. Live event subscriptions are not configured.

No external service is shown as successful merely because a placeholder exists.

## UI sources

Reusable controls use the repository's [ReUI](https://reui.io/) components. The custom agent chat adapts [BeautifulUI's ChatComposer](https://www.beautifului.dev/r/chat-composer.json) and uses headless CopilotKit. Existing ReUI/BeautifulUI transitions supply motion; no additional animation kit was introduced.

## Production build

```sh
cd web
npm run build
AFTERLIFE_LOCAL_MODE=1 npm run start -- --hostname 127.0.0.1
```

Model requests and workspace drafts/logs are restricted to same-origin loopback requests. A public deployment needs an authenticated, owner-scoped storage layer before these local APIs are enabled.

## Project layout

- `web/` — Next.js app
- `data/projects.json` — local snapshot used when Supabase is not configured
- `data/project-axes.json` — generated Astra map classifications
- `data/project-briefs.json` — concise project briefs derived from the original write-ups
- `web/scripts/generate-project-briefs.mjs` — resumable brief generation with source validation
- `scripts/generate-axes.mjs` — repeatable classifier with ignored response caching
- `scripts/sync-cognee.mjs` — resumable public archive upload and cloud graph processing
- `ingest/` — Python data ingestion pipeline
- `supabase/` — database schema and migrations
