# Afterlife UI mockups

Static HTML mockups for every Afterlife screen, sharing one design system in `tokens.css`. Open `index.html` for the gallery. All names, projects and numbers are sample data.

Serve the folder rather than opening files directly (some previewers don't resolve the relative `tokens.css` link from `file://`):

```sh
cd design/mockups && python3 -m http.server 8765   # then open http://127.0.0.1:8765/
```

| File | Screen | PRD |
|---|---|---|
| `index.html` | Gallery of all screens + system at a glance | n/a |
| `01-star-map.html` | Explore: 3D star map, lens picker, filters, prompt bar, agent answer + fly-to sequence | §5, Must 2–3 |
| `02-project-panel.html` | Node panel over the map: project, liveness + why, team evidence, actions | §5, Must 4 |
| `03-before-you-build.html` | Paste an idea → 5 closest projects, how far each got, who to message | §5 |
| `04-intro-draft.html` | Grok intro editor, cited evidence, Zero warm path / cold fallback, draft → Zero | Must 5, Should 8 |
| `05-speaker-finder.html` | Topic → ranked shortlist with evidence → Export to Notion | Should 7 |
| `06-claim-profile.html` | GitHub sign-in (Supabase Auth), confirm/hide, 3 questions, consent | Should 9 |
| `07-agent-log.html` | `agent_runs` log: ok / partial / failed, errors, how each was handled | Must 6 |

## Design rationale

- **Night sky, because the map is the product.** The main view is a glowing star field, so every surface is a deep blue-black (`--bg-0` → `--bg-3`) and the other pages carry a faint CSS star field (`.starfield`). Floating UI over the map uses frosted glass (`--bg-glass` + `--blur`) so the stars stay visible behind panels.
- **Liveness is the core encoding.** Alive = bright mint with a glow, dormant = amber, dead = faded grey, unknown = muted lavender. Each state also has a distinct shape (solid dot, solid amber dot, dashed ring, dotted "?") so it never relies on colour alone. Unknown is deliberately not dead: "no public repo" is shown as "can't tell".
- **One accent.** Starlight periwinkle (`--accent`) marks focus, selection, the agent and primary actions. Sponsor and source colours appear only in small badges and chips, never as large fills.
- **Evidence first.** Every claim about a person comes as a chip naming its source (Devpost, GitHub, HN, Luma), and sponsor contributions carry a small `via` badge (via Zero, via Cognee, Grok, Supabase, Notion). Missing evidence is shown as a dashed chip rather than dropped.
- **Honesty and consent are visible.** "Nothing sends automatically" appears next to every Send to Zero; hidden people are counted but never named; the agent log shows the real error text and how each failure was handled.
- **Two typefaces.** Space Grotesk for UI and headings, JetBrains Mono for data (counts, timestamps, run IDs, tool calls, micro-labels). Loaded once from Google Fonts in `tokens.css`.
- **Contrast.** All text tokens pass WCAG AA on every surface (`--text-3` is 5.4:1 on `--bg-3`, the weakest pair; `--dead` text is 4.8:1 on `--bg-3`). Text on accent fills uses `--text-inverse` (8.5:1).
- **Responsive.** Designed at 1440px. At ≤820px the map pages become a scrolling page: map on top (≈60vh), panel below, prompt bar sticky at the bottom. Tabs scroll horizontally inside the nav; tables either scroll inside their wrapper or collapse into stacked rows. No horizontal page scroll at 375px (checked).

## Tokens (`tokens.css`)

**Surfaces:** `--bg-0` page · `--bg-1` cards/panels · `--bg-2` inputs, hovered rows · `--bg-3` selected/pressed · `--bg-glass` floating panels · `--bg-scrim` labels over the map · `--bg-map-core` nebula centre of the map
**Lines:** `--line` hairline · `--line-strong` emphasised/inputs
**Text:** `--text-1` primary · `--text-2` secondary · `--text-3` captions · `--text-inverse` on light fills
**Accent:** `--accent` · `--accent-strong` · `--accent-soft` (tint bg) · `--accent-line` (tint border) · `--focus-ring`
**Liveness:** `--alive` `--alive-soft` `--alive-glow` `--alive-line` · `--dormant` `--dormant-soft` `--dormant-glow` `--dormant-line` · `--dead` `--dead-node` `--dead-soft` · `--unknown` `--unknown-node` `--unknown-soft`
**Run status:** `--ok` `--ok-soft` · `--partial` `--partial-soft` · `--failed` `--failed-soft` `--failed-line`
**Sources:** `--src-devpost` `--src-github` `--src-hn` `--src-luma`
**Sponsors:** `--sp-zero` `--zero-soft` `--zero-line` · `--sp-cognee` · `--sp-grok` · `--sp-supabase` · `--sp-notion`
**Avatar hues:** `--hue-1` … `--hue-6`
**Type:** `--font-sans`, `--font-mono`; sizes `--fs-11 12 13 14 16 18 22 28 36 48`; `--lh-tight` `--lh-snug` `--lh-body`; `--fw-regular/medium/semibold/bold`; `--tracking-caps`, `--tracking-tight`
**Spacing (4px base):** `--sp-1 2 3 4 5 6 8 10 12 16` (4–64px), `--gutter` 16px mobile
**Radii:** `--r-xs 4` `--r-sm 6` `--r-md 10` `--r-lg 14` `--r-xl 20` `--r-pill`
**Elevation:** `--shadow-1 2 3`, `--glow-accent`, `--glow-alive`, `--glow-dormant`
**Layout:** `--nav-h 56px`, `--panel-w 420px`, `--content-max 1200px`, `--blur`
**Motion:** `--ease`, `--dur-fast 120ms`, `--dur 220ms` (all motion off under `prefers-reduced-motion`)

### Porting to Tailwind

Map the custom properties straight into `theme.extend` (`colors: { bg: { 0: 'var(--bg-0)', … }, alive: 'var(--alive)', … }`, `spacing`, `borderRadius`, `fontSize`, `boxShadow`) and keep `tokens.css`'s `:root` block as a global stylesheet. Component classes below become React components; their CSS can move to `@layer components` or into Tailwind utilities one-to-one.

## Component inventory

| Component | Class(es) | Variants | Screens |
|---|---|---|---|
| App shell / top nav | `.topnav`, `.brand`, `.tabs`, `.tab[aria-current]`, `.tab__count` | — | all |
| Page header | `.page`, `.page__head`, `.eyebrow`, `.lead` | — | 03 04 05 06 07 index |
| Button | `.btn` | `--primary` `--ghost` `--zero` `--danger` `--sm` `--lg` `--block`, `[aria-current]` | all |
| Icon button | `.icon-btn` | — | 01 02 |
| Card | `.card`, `.card__head/__title/__meta` | `--interactive` `--selected` | 03 04 05 06 07 index |
| Side panel | `.panel`, `.panel__head/__body/__foot/__section` | — | 01 (agent answer), 02 (node panel) |
| Key-value list | `.kv` | — | 02 |
| Liveness badge | `.live` | `--alive` `--dormant` `--dead` `--unknown` | 01 02 03 06 07 index |
| Liveness dot / legend | `.dot`, `.map-legend` | `--alive` `--dormant` `--dead` `--unknown` `--person` | 01 |
| Evidence chip | `.chip`, `.chip__src`, `.chips` | `--devpost` `--github` `--hn` `--luma` `--zero` `--cited` `--missing` | 02 04 05 index |
| Tech tag | `.tag` | — | 02 03 |
| Sponsor badge | `.via` | `--zero` `--cognee` `--grok` `--supabase` `--notion` | 01 02 03 04 05 06 07 index |
| Run status | `.status` | `--ok` `--partial` `--failed` `--running` `--draft` | 01 02 04 05 07 |
| Prompt bar | `.prompt-bar`, `.prompt-bar__input`, `.prompt-suggestions`, `.suggestion`, `.kbd` | — | 01 02 |
| Lens picker | `.lens`, `.lens__axis`, `.lens__axis-key` | — | 01 |
| Segmented control | `.seg`, `.seg__opt[aria-pressed]` | — | 01 03 04 07 |
| Filter pill | `.pill[aria-pressed]` | — | 01 05 |
| Form field | `.field`, `.label`, `.hint`, `.input`, `.select`, `.textarea` | — | 01 03 04 05 06 07 |
| Switch | `.switch`, `.switch__track` | — | 06 |
| Choice card | `.choice` | checkbox / radio | 06 |
| Table | `.table-wrap`, `.table` | `tr[aria-expanded]` | 05 07 |
| Avatar | `.avatar` | `--sm` `--lg` `--h1…h6` `--hidden` | 02 03 04 05 06 |
| Progress meter ("how far it got") | `.meter`, `.meter__step--on`, `.meter-labels` | `--alive` `--dormant` `--dead` | 02 03 |
| Similarity score | `.score`, `.score__bar` | — | 03 07 |
| Agent message | `.agent-msg`, `.user-msg`, `.toolcall` | — | 01 |
| Fly-to sequence | `.flyto`, `.flyto__item[aria-current="step"]` | `--done` | 01 |
| Callout | `.callout` | `--safe` `--warn` `--error` `--zero` | 04 |
| Stat tile | `.stat`, `.stat__value`, `.stat__label` | — | 03 07 |
| Warm-intro path | `.path`, `.path__node`, `.path__edge` | `--cold` | 04 |
| Stepper (draft → in Zero → sent) | `.stepper`, `.stepper__step` | `--done` `--current` | 04 |
| Map chrome | `.map`, `.map-label` | `--hl` `--link` | 01 02 |
| Star field backdrop | `.starfield` | — | 03 04 05 06 07 index |

## Notes for the real build

- The canvas in 01/02 is a stand-in for `react-force-graph-3d`. Its colours are read from the CSS custom properties at runtime (`getComputedStyle`), which is the pattern to keep: node colour by liveness token, node size by traction, people as small `--text-2` dots, selected nodes ringed in `--accent`, and the fly-to route as a dashed `--accent` line.
- Hide people nodes until a project is selected or zoomed (PRD risk table).
- `aria-pressed` / `aria-current` drive the selected styles, so state and accessibility come from the same attribute.
