# VideoHub

A video and movie discovery platform: browse and search a catalogue, get AI recommendations that explain *why*, download from sources that permit it, and keep a personal watchlist and history.

Free for every user. No subscription, no payment system — but the data model carries a `UserPlan` enum so a premium tier can be added later without a migration that touches every row.

> **Status:** All seven phases complete and verified against a live Neon database.
> Later phases are tracked in [Roadmap](#roadmap).

---

## Contents

- [What it does](#what-it-does)
- [Download policy](#download-policy)
- [Architecture](#architecture)
- [Technology stack](#technology-stack)
- [Folder structure](#folder-structure)
- [Getting started](#getting-started)
- [Neon database setup](#neon-database-setup)
- [Prisma migrations](#prisma-migrations)
- [Development commands](#development-commands)
- [Environment variables](#environment-variables)
- [AI configuration](#ai-configuration)
- [Storage configuration](#storage-configuration)
- [Movie metadata configuration](#movie-metadata-configuration)
- [Testing](#testing)
- [API documentation](#api-documentation)
- [Uploads and moderation](#uploads-and-moderation)
- [Resilience and accessibility](#resilience-and-accessibility)
- [Security](#security)
- [Deployment](#deployment)
- [Roadmap](#roadmap)

---

## What it does

- **Discover** — browse movies and videos, filter by genre, year, rating, language and category, and search with instant suggestions.
- **VideoHub AI** — describe a mood, genre, runtime or a film you loved; the assistant recommends titles, explains its reasoning, and links to legitimate places to watch.
- **Authorized downloads** — paste a URL and VideoHub analyses it. If the source permits downloading, you get the file. If it doesn't, you get a clear explanation and a link to the original source.
- **Personal library** — watchlist, watch history with resume-where-you-left-off, and a record of your downloads.
- **Ibitente** — a kids surface with its own bright, animated, deliberately playful interface, separate from the dark cinematic theme used everywhere else.
- **Age-restricted content** — gated behind an account with verified date of birth and an explicit 18+ confirmation. Never returned to guests, unverified accounts, or accounts with Kids Mode on.

## Download policy

This is a product decision, enforced in code, not a disclaimer.

VideoHub's downloader is **allowlist-based**. A URL is downloadable only when its host appears in the authorized-hosts list *and* the licence permits it. Everything else gets a refusal with a specific reason and an "Open original source" link.

VideoHub does not, and will not:

- bypass DRM or any encryption scheme
- use or replay credentials on another platform
- defeat paywalls, subscriptions, or access controls
- evade rate limits, bot detection, or other technical protections

### How a URL is decided

Five rules, in order — the first that matches wins:

| # | Rule | On failure |
|---|---|---|
| 1 | Must parse, use `http(s)`, and carry no embedded credentials | `UNSUPPORTED_URL` / `REQUIRES_AUTH` |
| 2 | Must not be a known protected platform | `PROTECTED_CONTENT` / `ROBOTS_DISALLOWED` |
| 3 | Host must be on the allowlist | `HOST_NOT_ALLOWED` |
| 4 | Host must not resolve to a private or link-local address | `HOST_NOT_ALLOWED` |
| 5 | File must be within the size limit | `TOO_LARGE` |

A refusal is a **200 with `permitted: false`**, a specific reason, plain-language
copy, and the original URL — not an error. Refused attempts are also *recorded*
with status `BLOCKED`, so the reason stays visible in the user's download list
rather than vanishing.

Redirects are followed manually (`redirect: 'manual'`) and **re-evaluated against
all five rules at every hop**. Following them automatically would let a permitted
URL redirect to a blocked host without ever being checked.

### SSRF protection

The downloader fetches user-supplied URLs, which makes it an SSRF vector. Without
a guard, a caller could point it at `http://169.254.169.254/` and have the server
read its own cloud metadata, including credentials.

[`network-guard.ts`](apps/api/src/downloads/network-guard.ts) blocks loopback,
private, link-local, carrier-grade NAT, multicast and reserved ranges in both
IPv4 and IPv6, including IPv4-mapped IPv6 (`::ffff:127.0.0.1`) and `localhost`
by name.

The allowlist alone is **not** sufficient: an allowlisted domain could resolve to
a private address through a poisoned record or a DNS rebinding attack. So every
allowlisted host is resolved and every returned address is checked, and a host is
rejected if *any* of its addresses is in a blocked range.

### Being a good citizen

Outbound requests send a descriptive `User-Agent` with a contact URL — several
allowlisted hosts require one and rate-limit anonymous clients. A `429` is
surfaced as "try again in a few minutes" rather than a generic failure.

The allowlist and refusal copy live in [`packages/config/src/download-policy.ts`](packages/config/src/download-policy.ts); the engine is [`download-policy.service.ts`](apps/api/src/downloads/download-policy.service.ts).

## Architecture

```
                    ┌──────────────────────┐
   Browser ────────►│  apps/web            │
                    │  React + Vite + TW   │
                    └──────────┬───────────┘
                               │ REST (JSON envelope)
                    ┌──────────▼───────────┐
                    │  apps/api            │
                    │  NestJS              │
                    │                      │
                    │  auth · users        │
                    │  movies · videos     │
                    │  search · trending   │
                    │  watchlist · history │
                    │  downloads · ai      │
                    │  admin · health      │
                    └───┬──────┬───────┬───┘
                        │      │       │
          ┌─────────────▼┐  ┌──▼─────┐ └──────────────┐
          │ Prisma       │  │ AI     │  ┌─────────────▼┐
          │ PostgreSQL   │  │Provider│  │ Storage      │
          │ (Neon)       │  │        │  │ Service      │
          │              │  │ mock   │  │              │
          │ metadata     │  │ claude │  │ local        │
          │ only —       │  │ openai │  │ r2 / s3      │
          │ never media  │  │ gemini │  │ supabase     │
          └──────────────┘  └────────┘  └──────────────┘
```

Three things are deliberately swappable behind interfaces, so none of them can spread through the codebase:

| Interface | Implementations | Selected by |
|---|---|---|
| `AIProvider` | mock, claude, openai, gemini | `AI_PROVIDER` |
| `StorageService` | local, s3, r2, supabase | `STORAGE_PROVIDER` |
| `VideoCatalogueProvider` | none, archive.org | `VIDEO_CATALOGUE_PROVIDER` |
| `MovieMetadataProvider` | local, tmdb | `MOVIE_METADATA_PROVIDER` |

**The database stores metadata only.** Media bytes live in object storage and are referenced by URL or storage key. Never put video blobs in Postgres — it will exhaust a Neon free tier immediately.

## Technology stack

| Layer | Choice |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, Axios, Lucide |
| Backend | Node.js, TypeScript, NestJS, Passport JWT, class-validator, Helmet, Throttler, Swagger |
| Database | PostgreSQL (Neon), Prisma ORM |
| Tests | Jest + Supertest (API), Vitest + Testing Library (web) |
| Monorepo | npm workspaces |

TypeScript strict mode is on everywhere, including `noUncheckedIndexedAccess`.

## Folder structure

```
videohub/
├── apps/
│   ├── api/                        NestJS backend
│   │   ├── prisma/
│   │   │   ├── schema.prisma       Database schema (16 models)
│   │   │   ├── seed.ts             Taxonomy + admin
│   │   │   ├── seed-demo.ts        Optional public-domain demo content
│   │   │   ├── verify-constraints.ts    Compound uniques, upsert, cascades
│   │   │   ├── verify-age-gate.ts       Age gate + Kids Mode, end to end
│   │   │   ├── verify-trending.ts       Scoring job + admin guard
│   │   │   └── verify-downloads.ts      Policy, SSRF, real transfer
│   │   └── src/
│   │       ├── common/             Guards, filters, interceptors, decorators,
│   │       │                       pagination, content-visibility
│   │       ├── config/             Typed config + Zod env validation
│   │       ├── prisma/             PrismaService (global)
│   │       ├── storage/            StorageService + local / S3-compatible
│   │       ├── movie-metadata/     MovieMetadataProvider + local / TMDB
│   │       ├── auth/               Register, login, refresh, age verification
│   │       ├── users/              Profile, Kids Mode
│   │       ├── movies/             Listing, filters, detail, similar
│   │       ├── videos/             Listing, detail, Ibitente (kids) controller
│   │       ├── genres/             Taxonomy
│   │       ├── categories/         Taxonomy
│   │       ├── search/             Instant suggestions + full results
│   │       ├── trending/           Scoring service + hourly cron
│   │       ├── watchlist/          Save / remove / membership
│   │       ├── history/            Progress, Continue Watching
│   │       ├── downloads/          Policy engine, SSRF guard, transfer
│   │       └── health/             Liveness + dependency check
│   └── web/                        React frontend
│       └── src/
│           ├── components/
│           │   ├── layout/         Navbar, footer, shell, protected route
│           │   ├── media/          Cards, rails, grid, filters, pagination
│           │   ├── home/           Hero, rails, Continue Watching, CTAs
│           │   └── ui/             Button, input, loading/empty/error states
│           ├── pages/              Route components (all lazy loaded)
│           ├── contexts/           Auth context + provider
│           ├── hooks/              useAuth, useDebounce, useWatchlist
│           ├── services/           API calls grouped by domain
│           ├── test/               Shared render helper + setup
│           └── lib/                Axios client, helpers
├── packages/
│   ├── types/                      Shared DTOs and enums (dual CJS/ESM build)
│   └── config/                     Constants, taxonomy, download policy
├── scripts/                        Build helpers
├── docker-compose.yml              Local Postgres (offline alternative to Neon)
├── .env.example
└── README.md
```

### Why `packages/*` builds twice

The API runs on CommonJS (NestJS); Vite bundles ESM and cannot statically analyse tsc's `__exportStar` CJS interop. Each shared package therefore emits both, selected through the `exports` map. `scripts/finalize-package-build.mjs` writes the `type` marker into each output directory.

## Getting started

**Requirements:** Node.js 20+ and npm 10+.

```bash
npm install
```

```bash
cp .env.example .env
```

Generate real JWT secrets and paste them into `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Set `DATABASE_URL` and `DIRECT_URL` (see below), then:

```bash
npm run build --workspace=@videohub/types && npm run build --workspace=@videohub/config
```

```bash
npm run prisma:generate && npm run prisma:migrate && npm run db:seed
```

```bash
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:3000/api
- API docs: http://localhost:3000/api/docs

## Neon database setup

1. Create a project at [neon.tech](https://neon.tech) (free tier is enough).
2. Create a database named `videohub`.
3. From **Connection Details**, copy **both** strings:
   - the **pooled** connection → `DATABASE_URL` (what the app uses)
   - the **direct / unpooled** connection → `DIRECT_URL` (what `prisma migrate` needs)
4. Both must end with `?sslmode=require`.

```env
DATABASE_URL="postgresql://user:pass@ep-xxxx-pooler.region.aws.neon.tech/videohub?sslmode=require"
DIRECT_URL="postgresql://user:pass@ep-xxxx.region.aws.neon.tech/videohub?sslmode=require"
```

Migrations fail against the pooled endpoint — that is what `DIRECT_URL` is for.

### Local Postgres instead

```bash
docker compose up -d
```

Then point both URLs at `postgresql://videohub:videohub@localhost:5432/videohub`.

## Prisma migrations

```bash
npm run prisma:migrate
```

```bash
npm run prisma:generate
```

```bash
npm run prisma:studio
```

For production deploys, use `npm run prisma:deploy --workspace=@videohub/api` (applies existing migrations without generating new ones).

> The Prisma CLI reads `.env` from its own working directory, not the monorepo
> root, so every `prisma:*` script is wrapped in `dotenv -e ../../.env`. That
> keeps a single `.env` at the repository root as the one source of truth.

### Seeding

```bash
npm run db:seed
```

Seeds the taxonomy (19 genres, 10 categories including the 5 Ibitente ones) and,
when `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are set, an admin account. With
those variables unset it skips the admin rather than creating default
credentials.

```bash
npm run db:seed:demo --workspace=@videohub/api
```

Optional public-domain demo content (8 films, 6 videos) so the homepage rails,
trending job and Ibitente page render with real data during development.

### Verifying the database

Unit tests run against a mocked Prisma client, so they cannot prove behaviour
that depends on real PostgreSQL semantics. These scripts do, against a live
database:

```bash
npm run db:verify:all --workspace=@videohub/api
```

| Script | Proves |
|---|---|
| `db:verify` | Compound uniques behave as one row per user per title (Postgres treats NULLs as distinct), `upsert` through those keys, cascade deletes |
| `db:verify:agegate` | ADULT content is invisible to guests and unverified accounts across listing, detail, search, watchlist **and totals**; visible once verified; hidden again under Kids Mode |
| `db:verify:trending` | The scoring job ranks real rows and the manual trigger is admin-only |
| `db:verify:downloads` | Protected platforms are refused with a reason and a source link; SSRF targets are blocked; an authorized public-domain file really transfers, stores, and is deleted with its record |
| `db:verify:ai` | The assistant recommends only real catalogue titles, recommendations resolve to linkable records, conversations persist and stay private, and SSE actually streams |
| `db:verify:admin` | Every admin route is closed to normal users, uploads are invisible until approved, rejections require a reason, and deactivation kills live sessions |

Each creates its own namespaced fixtures and removes them again, so they are safe
to run against a database that holds real content. `db:verify:agegate` and
`db:verify:trending` need the API running (`npm run dev:api`).

## Development commands

Run from the repository root:

```bash
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | API and web together |
| `npm run dev:api` | API only, watch mode |
| `npm run dev:web` | Web only |
| `npm run build` | Build packages, then both apps |
| `npm run typecheck` | TypeScript across all workspaces |
| `npm run lint` | ESLint across all workspaces (zero warnings allowed) |
| `npm test` | Jest (API) and Vitest (web) |
| `npm run db:seed` | Seed genres, categories and an admin |
| `npm run db:seed:demo --workspace=@videohub/api` | Optional public-domain demo content |
| `npm run db:sync:catalogue --workspace=@videohub/api` | Pull real public-domain video from the Internet Archive |
| `npm run db:verify:all --workspace=@videohub/api` | Live checks against a running API + database |

## Environment variables

Full list with comments in [`.env.example`](.env.example). The essentials:

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | Neon pooled connection | *required* |
| `DIRECT_URL` | Neon direct connection, for migrations | *required* |
| `JWT_SECRET` | Access-token signing key | *required* |
| `JWT_REFRESH_SECRET` | Refresh-token signing key | falls back to `JWT_SECRET` |
| `AI_PROVIDER` | `mock` \| `claude` \| `openai` \| `gemini` | `mock` |
| `STORAGE_PROVIDER` | `local` \| `s3` \| `r2` \| `supabase` | `local` |
| `MOVIE_METADATA_PROVIDER` | `local` \| `tmdb` | `local` |
| `VIDEO_CATALOGUE_PROVIDER` | `none` \| `archive` — real public-domain video | `none` |
| `MAX_UPLOAD_MB` | Upload ceiling in MB | `2048` (2 GB) |
| `DOWNLOAD_ALLOWED_HOSTS` | Hosts the downloader may fetch from | built-in list |

The environment is validated with Zod at boot, so a misconfiguration fails immediately with a readable message rather than at the first request. Never commit `.env`.

## AI configuration

Development defaults to `AI_PROVIDER=mock`, which needs **no API key and costs nothing** — the whole app is usable and testable without an AI account.

```env
AI_PROVIDER=mock
```

To use a real provider, set the provider and its key:

```env
AI_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-5
```

> **Note:** a Claude Pro subscription does **not** include API access. The Anthropic API is billed separately. Keep `mock` for development.

Boot fails fast if you select a provider without its key, and falls back to the
mock at runtime if a key turns out to be missing — an unavailable model degrades
the assistant rather than stopping the app from starting.

AI endpoints carry their own tighter rate limit (`AI_RATE_LIMIT_MAX`) so a public
deployment cannot run up an unbounded bill, and streaming is aborted the moment
the client disconnects so an abandoned tab stops costing tokens.

### Who can use it

VideoHub AI is **open to everyone — no account needed**. A signed-out visitor
gets a real conversation thread; it simply has no owner, is never listed, and
its conversation id is the only handle to it. Signing in keeps the history.

Threads stay isolated in both directions: a guest cannot resume a signed-in
user's conversation by quoting its id, and a signed-in user cannot resume a
guest's. `/ai/conversations` (list, read, delete) remains account-only. Guest
threads are swept after 7 days, since nobody can ever return to them.

**Watch the cost.** With `AI_PROVIDER=mock` this is free. Point it at a real
provider and anonymous traffic can spend money, so `AI_RATE_LIMIT_MAX`
(default 10/minute) is the ceiling that matters — with no account to key on, the
throttler falls back to the caller's IP.

### How the assistant is kept honest

The model is given the catalogue as context and instructed to recommend **only**
from it. Titles it names are then resolved back against the database, so a
recommendation that does not correspond to a real record never reaches the UI as
a card. Inventing titles would send people looking for films that do not exist.

The system prompt also forbids claiming anything is downloadable — the assistant
does not know which sources permit it — and refuses to discuss bypassing DRM,
paywalls, or access restrictions.

### The recommendation engine

`GET /ai/recommendations` makes **no AI call at all**. It blends trending, genre
similarity and the user's own watchlist/history, weighted so preference beats
similarity beats trending, and falls back to trending for guests and new
accounts. That keeps the common case fast, free, and available to signed-out
visitors; the model adds explanation on top rather than carrying the feature.

## Storage configuration

`STORAGE_PROVIDER=local` writes to `STORAGE_LOCAL_DIR` and is **development only** — boot refuses it when `NODE_ENV=production`.

For production, use any S3-compatible provider (Cloudflare R2's free tier is a good default):

```env
STORAGE_PROVIDER=r2
STORAGE_BUCKET=videohub
STORAGE_ENDPOINT=https://<account>.r2.cloudflarestorage.com
STORAGE_ACCESS_KEY=...
STORAGE_SECRET_KEY=...
```

## Movie metadata configuration

`local` serves only your own database — no external calls, no key required.

`tmdb` enables metadata sync where permitted. Set `TMDB_API_KEY`. External calls are made only on explicit sync, never per page view.

## Real video catalogue

`VIDEO_CATALOGUE_PROVIDER` controls where playable video comes from.

| Value | Behaviour |
| --- | --- |
| `none` (default) | Your own uploads only. No third-party calls at all. |
| `archive` | Pulls real, public-domain video from the Internet Archive. No API key. |

```bash
npm run db:sync:catalogue --workspace=@videohub/api

# just the hand-checked titles, skipping bulk discovery
npm run db:sync:catalogue --workspace=@videohub/api -- --curated-only
```

The sync is idempotent: rows are keyed on `ia-<identifier>`, so re-running
updates rather than duplicates, and it **never overwrites a moderation decision
a human already made** — a rejected title stays rejected.

### Playback speed: mirror the media

Streaming straight from archive.org is slow for viewers. Measured from Kigali:

| | first byte | throughput |
|---|---|---|
| archive.org | 4.6-8.7s | 77-153 KB/s |
| mirrored to local storage | 0.22s | ~30 MB/s |

Its storage nodes are in the US with no CDN in front of them, and the
`/download/` URL costs an extra redirect hop (~1.6s) before any media arrives.
The files are correctly faststart — the index really is at the front — so this
is purely network distance, not container layout.

```bash
npm run db:sync:catalogue --workspace=@videohub/api -- --curated-only --mirror
npm run db:sync:catalogue --workspace=@videohub/api -- --mirror --mirror-max-mb=500
```

`--mirror` copies each file once into `StorageService` and repoints
`playbackUrl` at your own backend, so viewers never wait on a third party. It is
streamed, never buffered, and skips anything over `--mirror-max-mb` (default
200) so one feature film cannot fill the disk. A failed mirror falls back to the
provider URL — slower playback, never a dead row — and a re-run does not
re-download what is already mirrored.

In production point `STORAGE_PROVIDER` at R2 or S3 so those bytes come off a CDN
near the viewer.

The player also uses `preload="none"`. With `preload="metadata"` the browser
began fetching video the moment a page rendered, so opening any video page paid
the full remote latency before the viewer had asked for anything.

### Why it is a curated list and not a search box

The Internet Archive mixes librarian-curated collections with wide-open user
uploads. Probing the open ones while this was built returned, on the first page
of results: an extremist music video, a short advertising its own nude scene, a
film titled around child abuse, and several plainly copyrighted uploads. None of
that can be allowed to appear automatically in a catalogue that also serves a
children's section.

So content arrives one of two ways, both defined in
`packages/config/src/catalogue-sources.ts`:

- **`FEATURED_VIDEOS`** — individually checked identifiers, each with a note
  saying why it was cleared. These publish on sync.
- **`DISCOVERY_QUERIES`** — curated collections only, and every result lands in
  the moderation queue as `PENDING`. Same queue user uploads use, so there is
  one review surface rather than two.

Kids categories are never auto-published from a query. Public-domain animation
of the 1930s–40s carries well-documented racial caricature that no title filter
can detect, so the only titles published straight to Ibitente are the Blender
open movies.

There is deliberately no source for **African Cinema**. The Archive's
public-domain African holdings are colonial-era travelogues shot by European
crews; filing those under African Cinema would misrepresent both the films and
the category. That shelf is for uploads.

`downloadAllowed` is set from the stated licence only. An item with no licence
is not downloadable, however reachable its file happens to be.

## Testing

```bash
npm test
```

```bash
npm run test:cov --workspace=@videohub/api
```

API tests use Jest with a mocked Prisma client, so no database is needed. Web
tests use Vitest with Testing Library and assert on accessible roles and labels
rather than implementation details.

**Unit tests cannot prove everything.** Behaviour that depends on real PostgreSQL
semantics, real HTTP, or a real network is covered by the verification scripts in
[Verifying the database](#verifying-the-database) instead — run those against a
live API before trusting a deployment:

```bash
npm run db:verify:all --workspace=@videohub/api
```

Current counts: **190 API unit tests**, **38 web tests**, **121 live checks**
(`db:verify:all`).

## API documentation

Swagger UI is served at `/api/docs` when the API is running. Every endpoint is documented, with the bearer scheme registered so you can authorize in the UI and call protected routes directly.

Every response uses the same envelope:

```json
{ "success": true, "data": { } }
```

```json
{ "success": false, "message": "Movie not found", "code": "MOVIE_NOT_FOUND" }
```

Error codes are exported from `@videohub/types` so the client branches on `code`, never on message text. Internal errors, stack traces and connection strings are never sent to clients.

## Uploads and moderation

Anyone signed in can upload a video, but nothing reaches the public catalogue
unreviewed.

1. The uploader must tick an explicit **rights confirmation**. It is validated
   with `@Equals(true)` — a missing or falsy value is a validation failure, not a
   silent default.
2. The file is checked against **its own bytes**, not just the declared MIME
   type. `Content-Type` comes from the browser and is trivially forged, so the
   header is matched against known container signatures — an executable renamed
   to `.mp4` is rejected before it is ever stored.
3. The video is created `PENDING` and is excluded from every public query —
   listing, detail, search and trending — until an admin approves it. The
   uploader can still see their own submission and its status.
4. A moderator approves or rejects. **Rejecting requires a reason**, which the
   uploader sees, so "no" is always actionable.

`downloadAllowed` on an upload is only honoured when the rights claim is also
present — the service recomputes it rather than trusting the submitted flag.

### Downloading a video

The Download button on a video page hits `GET /api/videos/:slug/download`.

It is served through the API rather than linking straight at the media, for two
reasons: a cross-origin `<a download>` is ignored by browsers (the file opens in
a tab instead of saving), and routing through the API keeps the rights check
somewhere it cannot be skipped. `downloadAllowed` **and** `rightsConfirmed` must
both hold — exactly what the UI computes before offering the button.

- **Mirrored or uploaded** — redirects to the files route, which does ranges and
  resume properly.
- **Not mirrored** — streams from the allowlisted source, retried a few times
  because archive.org's nodes intermittently refuse a connection. If the source
  is unreachable the answer is `503 DOWNLOAD_SOURCE_UNAVAILABLE`, not a rights
  error — the licence permits it, the host is simply down. Mirroring the title
  removes that dependency.

Refusals are `404`, not `403`, for anything the viewer could not see anyway, so
this route cannot be used to probe which titles exist.

### Upload size

The ceiling is `MAX_UPLOAD_MB` (default 2048, i.e. 2 GB). Three things enforce it:

- The browser refuses an over-sized file the moment it is picked, so nobody
  spends an hour uploading something that was always going to be rejected.
- Multer aborts the request stream once the limit is passed, and the API returns
  `413 UPLOAD_REJECTED` naming the actual configured limit. The file is cut off
  mid-transfer rather than written out in full and then refused.
- `UploadsService` re-checks the size independently of the interceptor.

Uploads are **spooled to disk, never buffered in memory**, and streamed from
there into the storage backend. This matters at gigabyte scale: buffering a 2 GB
upload in RAM pins 2 GB of RSS for the life of the request, and the
five-per-minute throttle permits enough concurrency to take the process out with
an OOM. Measured on a 400 MB upload, peak API memory grew by 5 MB. The spool file
is removed on every exit path, including rejection.

### Admin safety rails

The admin surface refuses actions that would leave the platform unmanageable:

- an admin cannot demote or deactivate **their own** account
- the **last remaining** admin cannot be demoted
- deactivating a user **revokes their refresh tokens immediately**, so access
  ends at once rather than whenever the access token happens to expire

## Resilience and accessibility

Things a single-page app has to do deliberately, because the browser does them
for free on a full page load:

| Concern | How it is handled |
|---|---|
| A render crash | Two `ErrorBoundary` layers — one around the route outlet so a broken page keeps the navigation around it, one at the root for anything above. Without them a single thrown error leaves a blank page with nothing to act on. |
| Navigation | Scroll resets, focus moves to `<main>` so the next Tab starts at the top of the new page, and the new title is announced to screen readers via a polite live region. |
| Page identity | Every route sets a document title, which is both the browser tab and what the route announcer reads. |
| Motion | `prefers-reduced-motion` disables animation globally and switches scrolling from smooth to instant. |
| Keyboard | A skip link is the first tab stop; focus rings are never removed; icon-only controls all carry an accessible name. |
| Async state | Every data surface has explicit loading, empty and error states — an empty rail removes itself rather than rendering a bare heading. |

### Bundle

Every route is lazy-loaded and every icon is split individually, so the initial
load is roughly **104 kB gzipped** (React, TanStack Query, the shell and the
homepage) and no single page chunk exceeds 15 kB.

## Security

| Concern | How it is handled |
|---|---|
| Passwords | bcrypt, configurable rounds; never returned by any endpoint |
| Account enumeration | Login compares against a dummy hash when the user is missing, so timing and message are identical for an unknown email and a wrong password |
| Sessions | Short-lived JWT access tokens; opaque **rotating** refresh tokens stored only as SHA-256 hashes, so a database leak cannot be replayed |
| Authorization | Four stacked global guards — throttle → JWT → roles → age verification |
| Age-restricted content | Single choke point (`content-visibility.ts`) every catalogue query passes through; a 404 (not 403) hides the existence of restricted titles |
| SSRF | See [SSRF protection](#ssrf-protection) |
| Path traversal | Storage keys are sanitised *and* the resolved path is asserted to stay within the storage root |
| Input validation | Global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`; submitted values are never echoed back (they may contain passwords) |
| Rate limiting | Global limit, plus tighter per-endpoint limits on auth, search, analyze and download |
| Error responses | One exception filter; stack traces, SQL and connection strings never reach a client |
| Headers | Helmet, CORS restricted to `WEB_ORIGIN`, 1 MB body cap |
| Uploads | Stay `PENDING` and invisible to public search until an admin approves them |

Secrets live only in `.env`, which is gitignored. Boot fails fast on a
placeholder `JWT_SECRET` in production.

## Deployment

Designed to run at roughly $0/month on free tiers:

| Piece | Where |
|---|---|
| Frontend | Vercel / Netlify / Cloudflare Pages (static build) |
| API | Any Node host with a free tier (Render, Railway, Fly.io) |
| Database | Neon free tier |
| Media | Cloudflare R2 free tier |
| AI | `mock` in development; a configured provider in production |

**Frontend:** build command `npm run build`, output `apps/web/dist`. Set `VITE_API_URL` to the deployed API.

**API:** build `npm run build`, start `npm run start:prod --workspace=@videohub/api`. Run `prisma:deploy` as a release step. Set `WEB_ORIGIN` to the deployed frontend origin so CORS allows it.

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Monorepo, NestJS, Vite, Prisma/Neon, Tailwind, auth, layout, homepage | ✅ Complete |
| 2 | Movies, videos, search, categories, genres, trending, Ibitente | ✅ Complete |
| 3 | Watchlist, watch history, continue watching, profile | ✅ Complete |
| 4 | URL downloader and source policy engine | ✅ Complete |
| 5 | AI provider abstraction, chat, recommendation engine | ✅ Complete |
| 6 | Admin dashboard, user uploads, moderation | ✅ Complete |
| 7 | Animations, states, accessibility, performance, full test pass | ✅ Complete |

## License

MIT
