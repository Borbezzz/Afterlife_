# Afterlife

**Good ideas deserve an afterlife.**

Afterlife is a searchable archive of London hackathon projects and the people behind them. Explore what was built, follow the public evidence of what happened after the event, and find earlier work worth learning from or taking further.

The bundled archive contains 300 projects. It combines Devpost write-ups, public team profiles, linked GitHub repositories, and activity signals in an interactive 3D map and a browsable list.

## What you can do

- **Explore the archive:** filter projects by event, technology, and repository activity; switch between map and list views; inspect source links and concise project briefs.
- **Look before you build:** search for related projects and builders, with grounded summaries and links back to the original evidence.
- **Find speakers:** discover builders through their public projects, create a shortlist, and export it as CSV.
- **Prepare introductions:** generate, edit, save, copy, and download introduction drafts. Messages are never sent automatically.
- **Manage a builder profile:** record consent, speaking preferences, and discovery visibility. Verified ownership requires Supabase GitHub authentication.
- **Inspect the log:** review recorded searches, drafts, exports, and failures in the local workspace.

The archive and project pages work without service credentials. AI search, drafting, exports, and workspace operations currently run locally; see [deployment limits](#deployment-limits) before hosting publicly.

## Quick start

Use Node.js 22.18 or newer and npm. Run these commands from the repository root:

```sh
cd web
npm ci
cp .env.local.example .env.local
npm run dev
```

Open [localhost:3000](http://localhost:3000). The home route redirects to `/explore`.

No API key is needed to browse the bundled archive. Add `OPENAI_API_KEY` to `web/.env.local` for model-backed features. Without it, supported search and drafting flows use explicitly labelled local fallbacks.

### Run a production build locally

```sh
cd web
npm run build
AFTERLIFE_LOCAL_MODE=1 npm run start -- --hostname 127.0.0.1
```

The explicit local-mode flag permits workspace APIs on the loopback host in production mode. Keep it unset on public deployments.

## Configuration

Use [`web/.env.local.example`](web/.env.local.example) as the configuration reference. Never commit credentials. OpenAI, Cognee, and Zero credentials stay server-side and must not use a `NEXT_PUBLIC_` prefix.

| Service | Variables | Purpose |
| --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` | Grounded summaries, semantic retrieval, and introduction drafts |
| Model selection | `OPENAI_CHAT_MODEL`, `OPENAI_RELATIONSHIP_MODEL`, `OPENAI_AXIS_MODEL`, `OPENAI_BRIEF_MODEL` | Override the defaults recorded in the environment example |
| Cognee Cloud | `COGNEE_API_KEY`, `COGNEE_API_URL`, `COGNEE_DATASET` | Relationship retrieval from the public archive; dataset defaults to `afterlife` |
| Shared Cognee dataset | `COGNEE_DATASET_ID` | Optional explicit dataset UUID |
| Cognee timeout | `COGNEE_TIMEOUT_MS` | Defaults to 12 seconds, capped at 30 seconds |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional database reads and GitHub ownership verification |
| Zero | `ZERO_DRAFT_ENDPOINT`, `ZERO_API_KEY` | Optional verified draft-forwarding adapter |
| Site URL | `NEXT_PUBLIC_SITE_URL` | Canonical URLs and social metadata; otherwise uses the Vercel deployment environment or localhost |
| Telemetry | `COPILOTKIT_TELEMETRY_DISABLED=true` | Disable CopilotKit runtime telemetry |

For Supabase, apply [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), enable GitHub OAuth, and configure the app's `/claim` callback URL. Project reads fall back to the bundled snapshot if Supabase is unconfigured or a query fails.

## How the archive works

```text
Public Devpost projects + linked GitHub repositories
                         |
                  data/projects.json
                         |
             Next.js pages and 3D map
                         |
        Cognee relationship retrieval (optional)
                         |
      OpenAI summaries and semantic fallback (optional)
```

Next.js and React provide the application; Three.js powers the project map. CopilotKit supplies the assistant's tool transport. Cognee retrieves relationships from a scoped archive, and OpenAI produces summaries grounded in the returned evidence. Search reports retrieval provenance separately from whether a model summary succeeded.

Project briefs, map classifications, and impact lenses are generated offline and committed as JSON snapshots. Opening a project or selecting a node does not trigger brief generation.

### Evidence and interpretation

- Source links and original project write-ups remain available alongside the summaries.
- Repository activity is a dated signal from the ingestion pipeline, not a live guarantee that a project is maintained or abandoned.
- Map classifications and social impact potential are model inferences from public evidence. Potential and demonstrated impact are shown separately.
- Builder/project/event links do not establish investment, funding, employment, or willingness to speak.
- Hidden builders and local discovery opt-outs are excluded from relevant retrieval results and archive syncs.

## Maintain the data

The web app reads the committed snapshots without running ingestion. To refresh source records, use the Python pipeline documented in [`ingest/README.md`](ingest/README.md).

Run the following maintenance commands from the repository root. Generation and cloud sync require the corresponding credentials and can incur API charges.

### Sync the public archive to Cognee

```sh
node scripts/sync-cognee.mjs --dry-run
node scripts/sync-cognee.mjs
node scripts/sync-cognee.mjs --status
```

Add `--wait` to sync or status to wait for graph processing. Sync resumes from an ignored local manifest and uploads only new or changed public project records. It excludes private claim answers, introduction drafts, hidden builders, and local discovery opt-outs. It does not delete existing tenant data; remove earlier uploads through the tenant's dataset controls when necessary.

The local `GET /api/cognee` endpoint checks authenticated dataset access and reports graph processing progress when available. Dataset access alone does not mean processing is complete. If graph retrieval is unavailable or yields no resolvable archive references, search labels its semantic or local fallback.

### Regenerate project briefs and map lenses

```sh
node web/scripts/generate-project-briefs.mjs
node scripts/generate-axes.mjs
node scripts/generate-impact-lenses.mjs
```

The brief generator resumes from matching cached results, validates length limits and supporting quotes, and writes `data/project-briefs.json` atomically. Source hashes invalidate briefs when titles, taglines, or descriptions change. Uncached or changed records use a local source-based brief until regeneration.

## Deploy to Vercel

Import this repository and use these project settings:

| Setting | Value |
| --- | --- |
| Root Directory | `web` |
| Framework Preset | Next.js |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | Leave the Next.js default |
| Include source files outside of the Root Directory in the Build Step | Enabled |

The app reads `data/` next to `web/`, so the build needs access to files outside its root directory. [`web/next.config.ts`](web/next.config.ts) configures tracing for the bundled public snapshots. See [Vercel's monorepo guidance](https://vercel.com/docs/monorepos/monorepo-faq) for the external-source setting.

Set any required environment variables in the Vercel project settings. A browsing deployment can use the bundled snapshots without API keys. Run the production build locally before deploying; Vercel's Build Logs are the source of truth for a deployment failure.

### Deployment limits

The current public deployment supports archive browsing and project evidence pages. Search/chat, speaker discovery requests, introduction drafting, exports, and local workspace endpoints are protected by same-origin loopback checks and return `403` on public hosts. Adding API keys does not enable those endpoints publicly.

Profiles, drafts, operation logs, and the semantic index currently use ignored files under `data/local/`. A persistent Node.js host needs a persistent volume for this state. Vercel's function filesystem is not a durable store for it. Public interactive workflows require authenticated, owner-scoped persistence and appropriate API access controls before they can be enabled.

Direct Notion export and live event subscriptions are not implemented. Zero forwarding and Supabase ownership verification require their own service configuration.

## Verification

From the repository root:

```sh
cd web
node --test scripts/*.test.mjs tests/*.test.mjs
npm run lint
npm run build
```

To verify the production routes, start the server:

```sh
AFTERLIFE_LOCAL_MODE=1 npm run start -- --hostname 127.0.0.1 --port 3100
```

Then run in another terminal, from `web/`:

```sh
QA_BASE_URL=http://127.0.0.1:3100 node tests/routes.mjs
```

The route check covers the application pages, all bundled project pages, the home redirect, encoded project identifiers, and missing routes. See [`web/QA.md`](web/QA.md) for additional verification notes.

## Repository layout

| Path | Contents |
| --- | --- |
| `web/` | Next.js app, UI, API routes, and regression checks |
| `data/projects.json` | Public project and event snapshot |
| `data/project-briefs.json` | Generated concise descriptions with source validation |
| `data/project-axes.json` | Generated map classifications |
| `data/project-impact.json` | Evidence-backed impact lens data |
| `scripts/` | Cognee sync and offline map enrichment |
| `ingest/` | Python Devpost and GitHub ingestion pipeline |
| `supabase/` | Database schema and migrations |
| `design/` | Design references and mockups |

## License

The code is available under the [MIT License](LICENSE). Imported project descriptions and third-party assets remain attributable to their original sources; the code license does not grant rights to that source material.
