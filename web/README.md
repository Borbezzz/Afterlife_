# Afterlife web app

The Next.js application for Afterlife, a searchable archive of London hackathon projects and the people behind them. It includes a 3D project map, evidence pages, related-project search, speaker shortlists, and local introduction drafts.

See the [repository README](../README.md) for the product overview, environment variables, data maintenance, and Vercel deployment settings.

## Development

From this directory, using Node.js 22.18 or newer:

```sh
npm ci
cp .env.local.example .env.local
npm run dev
```

Open [localhost:3000](http://localhost:3000). The home route redirects to `/explore`. The bundled archive in `../data/` works without credentials; optional service configuration is documented in [`.env.local.example`](.env.local.example).

## Production build

```sh
npm run build
AFTERLIFE_LOCAL_MODE=1 npm run start -- --hostname 127.0.0.1
```

`AFTERLIFE_LOCAL_MODE=1` is for a loopback production server. Keep it unset on public hosts. Local workspace APIs require same-origin loopback requests; public interactive workflows need authenticated, owner-scoped persistence before being enabled.

## Checks

```sh
node --test scripts/*.test.mjs tests/*.test.mjs
npm run lint
npm run build
```

For production route checks and verification details, see [QA.md](QA.md).

## Vercel

Set the project Root Directory to `web`, use the Next.js framework preset, and enable **Include source files outside of the Root Directory in the Build Step** so the app can access `../data/`. Use `npm ci` and `npm run build`, with the default output directory.

Read the [deployment limits](../README.md#deployment-limits) before enabling a public deployment. API credentials alone do not enable the local workspace endpoints on a public host.
