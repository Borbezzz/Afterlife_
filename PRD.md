# Afterlife — PRD

> The event ends. The community's work continues.

A searchable 3D memory of every London hackathon project: what was built, by whom, how far it got, and who to message. Ask "has anyone built X?" and an agent flies you through the map to earlier projects and the people behind them, then drafts the intro.

Hackathon: Grok Community Hackathon, London, 22 Oct 2026. Code freeze **21:50**. Finalists get 3 minutes on stage.

---

## 1. Track decision

**Enter: Know Your Members (Track 2).** Fall back to Wildcard only if the judges won't accept "the London hack scene" as the community.

| | Know Your Members | Wildcard |
|---|---|---|
| Fit with Afterlife | Strong. Its **speaker finder** spec is "give it a topic → members and London builders, with proof from GitHub, Devpost, HN, Luma". That is Afterlife's search. Its **intro bot** is our "who to message" plus the drafted outreach. | Fits anything, but nothing in the brief points at us |
| Rubric | Concrete: quality of intros and speaker picks, **evidence for each**, honesty about failures, would a lead run it weekly | Vague: "a real community that would use it next week" |
| Winning demo the brief describes | "An introduction no organiser made by hand, end to end. Then a speaker shortlist for a real topic, each name with evidence." We can show both | "Name the community, show the problem, fix it live" |
| Risk | We have to frame Devpost builders as members, and add an opt-in/consent layer | Less to aim at, and the judges have no checklist to tick |

**Framing for the judges:** the community is *London's builder scene* (AI Agents Lab, The Hack Collective, AI Pilled, etc.). Today an organiser knows past hackers only as names in a Devpost gallery. Afterlife makes those 300 projects a member graph: what each builder made, what they used, whether it kept going. Organisers can then find speakers, judges and intro pairs with evidence attached.

What we take from the Track 2 spec, mapped onto Afterlife:

| Track 2 ask | Afterlife feature |
|---|---|
| Member graph in Cognee / Supabase | Projects ↔ people ↔ tech ↔ events graph, held in both |
| Opt-in questionnaire, consent stored | "Claim your profile": sign in with GitHub through Supabase, confirm or hide yourself, answer 3 questions (building now / want to meet / open to speaking) |
| Intro bot that explains why | Grok drafts a 1:1 intro that cites the shared evidence (same stack, same problem, complementary skills) |
| Speaker finder with evidence | "Find speakers on *agent memory*" returns a ranked shortlist, each name with Devpost wins, GitHub stars and commit recency, HN posts, Luma hosting |
| Log of what it tried and where it failed | A visible `agent_runs` log covering bad matches, missing data and rate-limit hits. We show it in the demo, because honesty is scored |
| Notion as the lead's view | Push a shortlist or intro batch to a Notion database |

---

## 2. Users and jobs

| User | Job | Example query |
|---|---|---|
| Builder (primary) | Before building, see who tried it, how far they got, who to talk to | "Has anyone built a WhatsApp bot for community events?" |
| Organiser | Find speakers and judges, introduce members | "Five speakers on AI agents with something shipped" |
| Investor / VC | Find builders in a thesis area with proof of execution | "Deep tech or hardware teams still committing 3+ months after the event" |
| Collaborator / distributor | Find a team to join or promote | "Consumer AI projects that won but stopped, with teams under 3" |

---

## 3. Sponsor and tool integration

Each sponsor has a job the product can't do without, so none of them is a logo bolted on.

### Cognee — the memory and reasoning layer (core)
- Ingest every project as a document (title, description, built-with, team, event, date, README excerpt). `cognify` extracts entities and links **Project → Person → Technology → Event → Problem domain**.
- `search` (graph completion) answers the natural-language query and returns related nodes. Its results drive which dots light up.
- Graph-derived answers like "people who used LangGraph *and* worked on voice" become multi-hop queries Cognee can answer and plain vector search can't.
- Builder questionnaire answers are added to Cognee too, so "wants to meet hardware people" becomes part of the memory.
- Use Cognee Cloud if keys are available on the night. Self-hosted `cognee` (Apache-2.0) is the fallback.

### Supabase — the source of truth, auth, consent and live updates (core)
- **Postgres**: `projects`, `people`, `project_members`, `technologies`, `events`, `edges`, `consent`, `questionnaire_answers`, `intro_drafts`, `agent_runs`.
- **pgvector**: an embedding per project. It gives 3D axis coordinates (see §5) and a fallback search if Cognee is slow.
- **Auth (GitHub OAuth)**: "Claim your profile". This is the opt-in and consent that Track 2 asks for. Unclaimed people show only public Devpost data; anyone can hide themselves.
- **Realtime**: projects submitted tonight appear as new stars live on stage ("we just added this hackathon").
- **Edge Functions**: ingest webhook and the GitHub liveness refresh.
- **Storage**: project thumbnails from Devpost.
- Supabase credits are part of every prize tier, so using it in depth matters.

### Zero — from "found them" to "reached them" (differentiator)
Zero is a GTM platform covering lead search, enrichment, warm intros and outreach sequences, with an MCP server, an API and Luma sync.
- **Enrich**: when a user opens a person node, call Zero to enrich it (role, company, socials) and show it as a "via Zero" badge.
- **Warm intro path**: ask Zero whether the user's network has a warm path to this builder. If not, fall back to a cold draft.
- **Send to Zero**: the Grok-drafted message plus the contact are pushed into a Zero outreach sequence as a **draft**. A human presses send. Nothing goes out automatically.
- **Luma sync**: pull London hackathon events and hosts (hosts make good speaker candidates).
- ⚠️ Check exact endpoints with Mariia Nedelkina at the start of the night (docs.zero.inc/developers/api, /mcp). If the API can't do it, the MCP route from the Grok agent is plan B.

### Grok (xAI) — the agent that drives the space and writes the intros (core)
- The **navigator agent** behind the prompt bar, with tool calls:
  - `search_memory(query)` → Cognee
  - `fly_to(node_id)`, `highlight(node_ids)`, `set_axes(x,y,z)`, `filter(status|event|tech)` → the 3D scene
  - `get_evidence(person_id)` → Supabase, GitHub, HN
  - `draft_intro(from, to, reason)` → message text with cited evidence
  - `send_to_zero(draft_id)` and `export_to_notion(list)`
- It narrates as it flies: "Three teams tried this. *Pulse* (Encode Club, Mar 2025) got furthest: 40 commits, last push 2 weeks ago. Want me to draft an intro to Priya?"
- Also used offline in ingest to tag each project with domain, stage and a one-line "where it stopped" summary.
- Load the repo into the **grok-bot-skill** so the team's Grok Bot has project context while building. Mention this in the README.

### Notion — the organiser's view (cheap, nice to have)
- "Export shortlist" writes a Notion database row per speaker or intro with its evidence links. Track 2 names Notion as the lead's view, so this is an easy point to pick up.

### Cursor — how we build
- Built with Cursor. Mention it in the README and on the demo slide. The main prize is Cursor Ultra.

---

## 4. Data

**Target: 150–300 London hack projects**, saved as `data/projects.json` and loaded into Supabase and Cognee.

Pipeline (`ingest/`, Python):
1. `devpost.com/api/hackathons?status[]=ended&search=london` (browser User-Agent; 9 per page) gives London hackathons.
2. For each hackathon, scrape `<slug>.devpost.com/project-gallery` for project URLs.
3. For each project page, collect title, tagline, description, built-with, team (Devpost usernames), GitHub/demo links, winner flag, likes.
4. **GitHub API** (personal token, 5k/hr): repo `pushed_at`, stars, commit count since the event. This gives liveness: **alive** (pushed < 60 days ago), **dormant**, or **dead** (no push since event week, or no repo).
5. **HN Algolia**: mentions of the project or builder (evidence).
6. **Luma**: London events and hosts (speaker evidence; match to events by name and date).
7. Grok enrichment: domain tags, stage, "where it stopped".
8. Upsert into Supabase, then `cognee.add` and `cognify`.

Rules: public data only. Don't commit the Hack Collective export or anything else shared with consent; keep it under `data/private/` (gitignored). Cache every fetch to disk so ingest is re-runnable.

---

## 5. Experience — the 3D star map

- **Scene**: `react-force-graph-3d`. Project nodes are glowing stars sized by traction, people are smaller nodes, and edges join builders to projects. **Dead projects fade grey, alive ones glow.**
- **Axes = lenses**: each axis is a topic people care about (AI agents, deep tech/hardware, climate, fintech, health, devtools, consumer, B2B…). A node's position on an axis is the cosine similarity between its embedding and that topic's embedding, pinned via `fx/fy/fz`. The user (or the agent, via `set_axes`) swaps lenses: an investor sets *Hardware × Climate × Traction*.
- **Prompt bar** at the bottom. The agent answers in a side panel and moves the camera (`cameraPosition` tween) from node to node in order.
- **Node panel** (click or agent fly-to) has three parts:
  - Project: event, date, description, built-with, team, links, liveness and why
  - People: other projects, evidence chips (Devpost win, GitHub, HN, Luma)
  - Actions: **Draft intro** (Grok), **Send to Zero**, **Add to shortlist** (Notion)
- **"Before you build" mode**: paste your idea, see the closest 5 projects, how far each got, and who to message.

---

## 6. Scope

### Must (demo is broken without these)
1. Ingest ≥150 London projects into Supabase and Cognee
2. 3D map with liveness colouring and topic axes
3. Prompt bar → Cognee search → highlight + fly-to
4. Node panel with evidence
5. Grok intro draft that cites evidence
6. `agent_runs` failure log, visible in the UI

### Should
7. Speaker finder: topic in, ranked shortlist with evidence out, exported to Notion
8. Send to Zero (draft sequence) + Zero enrichment badge
9. Claim profile through Supabase GitHub auth, with the questionnaire and hide-me option
10. Realtime: tonight's projects appear live

### Stretch
11. Weekly "intro of the week" job per claimed builder (Supabase cron → Grok → Zero draft). This answers Track 2's "still works a month later without the organiser"
12. Agent-picked axes ("show me this as an investor would see it")

### Out of scope
Auto-sending messages, scraping LinkedIn, private data in the public repo.

---

## 7. Architecture

```
Devpost / GitHub / HN / Luma ──► ingest (Python) ──► Supabase (Postgres + pgvector + Storage)
                                         │                      ▲  Realtime, Auth, Edge Fns
                                         └──► Cognee (graph memory)
                                                         ▲
Next.js app (react-force-graph-3d) ◄── /api/agent ── Grok (tool calls)
   prompt bar · node panel · log            │
                                            ├── Zero API/MCP (enrich, warm intro, draft sequence)
                                            └── Notion API (shortlists)
```

Stack: Next.js + TypeScript (Vercel), Python ingest, Supabase JS, Cognee Python SDK/Cloud API, xAI API (Grok), Zero API, Notion SDK. Licence: **MIT** (public repo is required).

---

## 8. Demo script (3 min)

1. **0:00 Problem (20s)**: "London ran 40 hackathons this year. 300 projects. Two weeks later, nobody remembers who built what."
2. **0:20 The map (30s)**: fly into the star map. Grey stars are dead projects, bright ones kept going. Switch the lens to *Hardware × Climate*.
3. **0:50 Before you build (50s)**: type "WhatsApp bot that revives dead community chats". The agent flies to 3 prior projects, explains how far each got, and drafts an intro to the builder who got furthest, citing shared evidence. **Send to Zero**: the draft lands in a Zero sequence. *An intro no organiser made by hand.*
4. **1:40 Speaker finder (40s)**: "5 speakers on agent memory for next month." Ranked shortlist, each with evidence chips → Export to Notion.
5. **2:20 Honesty (20s)**: open the agent log, showing a bad match and a missing GitHub repo, and how each was handled.
6. **2:40 Close (20s)**: open source, MIT, re-run `ingest` with any Luma calendar and another community has it next week. Supabase realtime: tonight's projects just appeared.

Each step lines up with a judging criterion: technical execution, open source/reusable, community context, better than today, usefulness, demo quality.

---

## 9. Success metrics (for the pitch)
- Projects indexed; % with a team identified; % with a GitHub repo checked for liveness
- Top-5 relevance on 10 hand-written test queries (we score it ourselves and show the number)
- Intro drafts with ≥2 pieces of cited evidence: target 100%

## 10. Risks
| Risk | Mitigation |
|---|---|
| Devpost 403s / slow scraping | Browser UA, on-disk cache, start ingest first thing; seed with 50 projects if needed |
| Cognee latency on stage | Pre-warm queries; pgvector fallback path |
| Zero API doesn't support what we want | Ask the Zero team early; MCP via Grok agent; mock last |
| 3D map unreadable with 600+ nodes | Hide people nodes until zoomed or selected; cluster by event |
| Privacy objections | Public data only, claim and hide flow, drafts never auto-sent |

## 11. Team split (suggested)
- **A: Ingest**: Devpost/GitHub/HN/Luma → Supabase + Cognee
- **B: 3D map + panel** (react-force-graph-3d, axes, camera)
- **C: Agent**: Grok tool calls, Cognee search, intro drafts, log
- **D: Integrations**: Zero, Notion, Supabase auth and realtime, deploy
