# Maintaining VideoHub

A working reference for whoever runs this next — including you in six months.

[README.md](README.md) explains what the code *is*. [DEPLOYMENT.md](DEPLOYMENT.md)
explains how to deploy it from scratch. **This file is about the system that is
already running**: what is deployed where, how to operate it safely, and what
goes wrong.

---

## Contents

1. [The live inventory](#1-the-live-inventory)
2. [Movies vs Videos — read this first](#2-movies-vs-videos--read-this-first)
3. [Running commands against production](#3-running-commands-against-production)
4. [Routine operations](#4-routine-operations)
5. [How a deploy actually works](#5-how-a-deploy-actually-works)
6. [Troubleshooting](#6-troubleshooting)
7. [Scheduled jobs](#7-scheduled-jobs)
8. [Environment variables](#8-environment-variables)
9. [Content safety rules](#9-content-safety-rules)
10. [Costs and free-tier limits](#10-costs-and-free-tier-limits)
11. [Where things live in the code](#11-where-things-live-in-the-code)
12. [Known issues](#12-known-issues)

---

## 1. The live inventory

| Piece | Where | Notes |
| --- | --- | --- |
| Web app | `https://videohub-web.onrender.com` | Render **static site**, service `videohub-web` |
| API | `https://videohub-api-tklf.onrender.com` | Render **Node web service**, `videohub-api`, region Frankfurt, free plan |
| Database | Neon PostgreSQL | AWS **us-east-2 (Ohio)**, free plan |
| Object storage | Cloudflare R2, bucket `videohub` | Western Europe (WEUR), 10 GB free, zero egress cost |
| Infrastructure as code | [`render.yaml`](render.yaml) | Render re-reads it on every push to `main` |

The API URL carries a `-tklf` suffix because `videohub-api` was already taken
globally. **Nothing may hardcode these URLs**: the front end learns the API
address from `VITE_API_URL`, and the API learns the front end's from
`WEB_ORIGIN`.

> **Region mismatch.** The API is in Frankfurt; the database is in Ohio. Every
> query crosses the Atlantic — roughly 100 ms each, and a page makes several.
> Render cannot move a service, so fixing it means changing `region:` in
> `render.yaml`, creating a replacement service with a new URL, and updating
> `VITE_API_URL` and `WEB_ORIGIN` to match.

---

## 2. Movies vs Videos — read this first

This single distinction causes more confusion than anything else in the system.
They are **two separate tables serving two different purposes**.

| | `Video` | `Movie` |
| --- | --- | --- |
| What it is | A playable file | A catalogue entry for a film |
| Has a player | **Yes** — `playbackUrl` / `storageKey` | **No** |
| Detail page shows | The video itself | Poster, synopsis, and a list of **sources** to watch it elsewhere |
| Created by | `db:sync:catalogue`, and user uploads | `db:movies:from:catalogue`, `db:seed:demo`, admin |
| Moderation | Yes — `moderationStatus` | No |
| Surfaces on | Videos, Trending, Ibitente, Cartoons, Kids | Movies |

A film can legitimately exist as **both**: the `Video` is how you watch it, the
`Movie` is how you find and read about it. `db:movies:from:catalogue` builds the
`Movie` rows *from* the `Video` rows so the two never drift apart.

**If the Movies page is empty but Videos is full**, this is why — the catalogue
sync only creates `Video` rows. Run `db:movies:from:catalogue`.

---

## 3. Running commands against production

### The `:ci` scripts exist for a reason

Most database scripts are wrapped in `dotenv -e ../../.env`, which loads the
**local development** environment. That is correct for local work and dangerous
when pointed at production — it would silently override the connection string
you meant to use.

Every script that may be run against production therefore has a `:ci` twin with
no wrapper, so **the caller's environment wins**:

| Local (uses `.env`) | Production (`:ci`, caller's env) |
| --- | --- |
| `prisma:generate` | `prisma:generate:ci` |
| `prisma:deploy` | `prisma:deploy:ci` |
| `db:seed` | `db:seed:ci` |
| `db:seed:demo` | `db:seed:demo:ci` |
| `db:make:admin` | `db:make:admin:ci` |
| `db:sync:catalogue` | `db:sync:catalogue:ci` |
| `db:movies:from:catalogue` | `db:movies:from:catalogue:ci` |

**Adding a new script that touches the database? Add its `:ci` twin at the same
time.**

### The production env file

Create `.env.production.local` in the repository root. The `.env.*.local`
pattern in [`.gitignore`](.gitignore) already covers it — **do not** name it
`.env.production`, which is not ignored.

```
DATABASE_URL=<Neon pooled string, host contains -pooler>
DIRECT_URL=<Neon direct string, no -pooler>

JWT_SECRET=<any 32+ character string>

STORAGE_PROVIDER=r2
STORAGE_BUCKET=videohub
STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STORAGE_ACCESS_KEY=<R2 access key id>
STORAGE_SECRET_KEY=<R2 secret access key>
STORAGE_PUBLIC_URL=https://pub-<id>.r2.dev
STORAGE_REGION=auto

VIDEO_CATALOGUE_PROVIDER=archive
```

Two things people get wrong:

- **`STORAGE_ENDPOINT` must not include `/videohub`.** The S3 client runs with
  `forcePathStyle: true` ([s3.storage.ts](apps/api/src/storage/providers/s3.storage.ts)),
  so it appends the bucket itself. Cloudflare displays the endpoint *with* the
  bucket on the end — trim it, or every object lands at `/videohub/videohub/…`.
- **`JWT_SECRET` here is a throwaway.** It exists only so the config validator
  lets `sync-catalogue` boot the app module; nothing signs a token during these
  commands. It does not need to match the value Render generated, and you should
  not try to copy that one.

### Running one

```bash
npx dotenv -e .env.production.local -- npm run <script>:ci --workspace=@videohub/api
```

Arguments pass through the second `--`:

```bash
npx dotenv -e .env.production.local -- npm run db:make:admin:ci --workspace=@videohub/api -- someone@example.com
```

---

## 4. Routine operations

### Add or refresh catalogue content

```bash
npx dotenv -e .env.production.local -- npm run db:sync:catalogue:ci --workspace=@videohub/api -- --curated-only
```

Idempotent, and it **never overrides a human moderation decision**. `--curated-only`
skips the discovery queries; drop it to also pull collection results, which land
as `PENDING` for review.

Then rebuild the Movies page from what arrived:

```bash
npx dotenv -e .env.production.local -- npm run db:movies:from:catalogue:ci --workspace=@videohub/api
```

**Run these two together.** The second is what makes new films appear on the
Movies page.

### Make someone an admin

They must register through the UI first — the password has to be hashed by the
app.

```bash
npx dotenv -e .env.production.local -- npm run db:make:admin:ci --workspace=@videohub/api -- someone@example.com
```

They must then **sign out and back in**. The role is baked into the access token
when it is issued, so an existing session keeps the old role no matter how many
times the page is refreshed.

`-- --demote` reverses it, and refuses to remove the last remaining admin.

### Speed up playback by mirroring

By default every catalogue title streams from archive.org, which can take up to
30 seconds to first byte from East Africa. Mirroring copies the files into R2 so
they serve from Cloudflare's CDN:

```bash
npx dotenv -e .env.production.local -- npm run db:sync:catalogue:ci --workspace=@videohub/api -- --curated-only --mirror --mirror-max-mb=200
```

This downloads to *your* machine and uploads to R2, so it is slow and uses your
bandwidth. The 200 MB cap is deliberate — it takes the short films and leaves
the feature-length ones streaming, which is the difference between roughly
0.6 GB and 2.3 GB of the free 10 GB.

---

## 5. How a deploy actually works

Pushing to `main` triggers Render, which re-reads [`render.yaml`](render.yaml)
and rebuilds both services.

**API build order — every step is load-bearing:**

```
npm ci --include=dev
npm run prisma:generate:ci --workspace=@videohub/api
npm run build:api
npm run prisma:deploy:ci --workspace=@videohub/api
```

| Step | Why it is where it is |
| --- | --- |
| `--include=dev` | `NODE_ENV=production` makes npm skip devDependencies, and `typescript`, `prisma`, `vite` and `@nestjs/cli` all live there |
| `prisma generate` **before** the build | The API's TypeScript imports the generated client; compiling first fails on a clean checkout |
| `build:api`, not `build` | Scoped to `types → config → api`, so the API does not build the web bundle |
| `migrate deploy` last | Applied once per deploy rather than raced by several booting instances |

**Web build:** `npm ci --include=dev && npm run build:web`.

> **`VITE_API_URL` is compiled into the bundle.** Changing it requires a
> **rebuild**, not a restart. The fastest way to confirm a change took effect is
> that the bundle filename hash under `/assets/index-*.js` changed — if it is
> identical, the variable did not reach the build.

---

## 6. Troubleshooting

### `Can't reach database server at ep-….neon.tech`

Neon's free tier suspends after inactivity. **Run the command again** — the
first attempt wakes it. Not a misconfiguration; you will see this regularly.

### Front end shows "Couldn't load…" on every page

`VITE_API_URL` did not reach the build, so the bundle fell back to
`http://localhost:3000/api` ([api-client.ts](apps/web/src/lib/api-client.ts)) and
the browser is calling the visitor's own machine.

Check what actually shipped:

```bash
curl -s https://videohub-web.onrender.com/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
```

Then fetch that file and grep for `onrender.com/api` or `localhost`. Fix by
setting `VITE_API_URL` **on the `videohub-web` static site** — not on the API,
where nothing reads it — then *Clear build cache & deploy*.

### CORS errors in the browser console

`WEB_ORIGIN` on the API must be the static site's URL **exactly**, with no
trailing slash. Verify without a browser:

```bash
curl -s -D - -o /dev/null -H "Origin: https://videohub-web.onrender.com" \
  https://videohub-api-tklf.onrender.com/api/health | grep -i access-control
```

### Build fails: `TS5108: Option 'moduleResolution=node10' has been removed`

Misleading error. It means `typescript` was not installed, so `tsc` resolved to
whatever the build image ships. Cause is a missing `--include=dev` — see
[§5](#5-how-a-deploy-actually-works). The pinned 5.9.3 compiles this config
fine.

### Build fails on Prisma types

`prisma generate` ran after the compile, or not at all. See [§5](#5-how-a-deploy-actually-works).

### Blueprint rejected: `services[N].plan no such plan free for service type web`

A `plan:` key on a `runtime: static` service. Static sites have no plan tiers;
remove the key. Only the Node service takes one.

### First visit takes a minute

Render free web services sleep after ~15 minutes idle, and Neon suspends too.
Both waking at once makes the first request genuinely slow. Static assets are
always instant, so the symptom is a page that renders and then hangs. The only
real fix is a paid instance.

### Uploads are slow

Expected on the free tier, for four compounding reasons: 0.1 CPU and 512 MB RAM
on the instance; a possible cold start before the first byte moves; the file
crossing the network twice (browser → Render → R2); and upload bandwidth to
Europe. Upgrading the instance is the practical fix; presigned browser-to-R2
uploads would be the engineering fix.

---

## 7. Scheduled jobs

| Job | Schedule | Code |
| --- | --- | --- |
| Recalculate trending scores | hourly | [trending.service.ts](apps/api/src/trending/trending.service.ts) |
| Purge guest AI conversations | daily, 04:00 | [ai-agent.service.ts](apps/api/src/ai-agent/ai-agent.service.ts) |

These need a process that stays alive between requests, which is the main reason
the API cannot be deployed as serverless functions.

**On the free tier a sleeping instance does not run crons.** Trending scores can
therefore lag on a quiet site.

---

## 8. Environment variables

Set on **`videohub-api`** (Node service):

| Variable | Source |
| --- | --- |
| `DATABASE_URL` | Neon pooled |
| `DIRECT_URL` | Neon direct |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | **Generated by Render** — never reuse a dev value |
| `WEB_ORIGIN` | Static site URL, exact, no trailing slash |
| `STORAGE_PROVIDER` | `r2` — `local` is **refused** when `NODE_ENV=production`, because Render's disk is wiped every deploy |
| `STORAGE_BUCKET`, `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_PUBLIC_URL`, `STORAGE_REGION` | Cloudflare R2 |
| `MAX_UPLOAD_MB` | `500` in production (2048 in development) |
| `AI_PROVIDER` | `mock`. **Switching to a real provider means anonymous visitors can spend money** — AI is open to signed-out users |
| `VIDEO_CATALOGUE_PROVIDER` | `archive` |
| `RATE_LIMIT_MAX`, `AI_RATE_LIMIT_MAX` | `120` / `10` |

Set on **`videohub-web`** (static site):

| Variable | Source |
| --- | --- |
| `VITE_API_URL` | API URL **plus `/api`** |

The full validated list is [env.validation.ts](apps/api/src/config/env.validation.ts),
which fails fast on boot rather than at the first request.

---

## 9. Content safety rules

These are deliberate and should survive refactors.

- **Curated titles publish; discovered ones queue.** `FEATURED_VIDEOS` in
  [catalogue-sources.ts](packages/config/src/catalogue-sources.ts) are
  hand-checked identifiers, each carrying a note explaining why it was cleared.
  `DISCOVERY_QUERIES` results always land as `PENDING`.
- **Kids categories are never auto-published from a query.** Probing
  archive.org's open collections during development returned extremist,
  sexual and copyrighted material on the first page of results. Public-domain
  animation of the 1930s–40s also carries well-documented racial caricature that
  no title filter can detect.
- **ADULT content is hidden from the homepage** and visible only to signed-in,
  age-verified users. Kids Mode overrides age verification, never the reverse.
- **Hidden content returns 404, not 403**, so the API does not disclose that a
  title exists.
- **Downloads follow the licence only.** `downloadAllowed` is set from rights,
  and nothing in this codebase circumvents DRM, paywalls or technical
  protection — see [Download policy](README.md#download-policy).

---

## 10. Costs and free-tier limits

| Resource | Free allowance | What eats it |
| --- | --- | --- |
| Cloudflare R2 | 10 GB stored, **egress free** | Mirrored video and uploads |
| Render web service | 750 instance-hours/month, sleeps when idle | — |
| Render static site | Unlimited, never sleeps | — |
| Neon | One project, suspends when idle | — |

The whole curated catalogue mirrored is about 2.3 GB, and the five longest
titles are 1.7 GB of that — 73%. Capping at `--mirror-max-mb=200` keeps you near
0.6 GB.

R2 is the right choice here **for the egress, not the storage**. S3 charges
about $0.09/GB to serve; a hundred views of one 400 MB film is 40 GB. R2 charges
nothing.

---

## 11. Where things live in the code

| Area | Path |
| --- | --- |
| Auth, JWT, guards | [apps/api/src/auth](apps/api/src/auth) |
| Content visibility / age gating | [apps/api/src/common](apps/api/src/common) — `allowedRatings`, `visibilityWhere`, `canView` |
| Catalogue ingest from archive.org | [apps/api/src/video-catalogue](apps/api/src/video-catalogue) |
| Curated source list | [packages/config/src/catalogue-sources.ts](packages/config/src/catalogue-sources.ts) |
| Object storage providers | [apps/api/src/storage/providers](apps/api/src/storage/providers) |
| Serving local files (`/api/files/*`) | [files.controller.ts](apps/api/src/storage/files.controller.ts) |
| Uploads (disk spooling) | [apps/api/src/uploads](apps/api/src/uploads) |
| Download rights enforcement | [apps/api/src/downloads](apps/api/src/downloads) |
| AI assistant, guest isolation | [apps/api/src/ai-agent](apps/api/src/ai-agent) |
| Moderation UI | [moderation-panel.tsx](apps/web/src/components/admin/moderation-panel.tsx) |
| Shared search field | [search-field.tsx](apps/web/src/components/media/search-field.tsx) |
| Operational scripts | [apps/api/prisma](apps/api/prisma) |

Two implementation details worth knowing before you touch them:

- **Uploads spool to disk, not memory.** `memoryStorage()` at the 2 GB ceiling
  would exhaust the container. Disk spooling measured +5 MB RSS on a 400 MB
  upload instead of +400 MB. The spool file is always removed in a `finally`.
- **`getSlowSource` exists because Node's `fetch` gives up at ~10 seconds** and
  some archive.org nodes take 30 — one measured at 29.6 s for a 1 KB range
  request. It is a `node:https` wrapper with a caller-chosen timeout. Do not
  "simplify" it back to `fetch`.

### Tests

```bash
npm test
```

237 API tests (Jest) and 57 web tests (Vitest). Vitest does **not** typecheck, so
run `npm run typecheck` too — a fixture missing a field will render
"Invalid Date" rather than fail.

---

## 12. Known issues

| Issue | Impact | Fix |
| --- | --- | --- |
| API in Frankfurt, database in Ohio | ~100 ms per query, several per page | Recreate the API service in a US region, update both URLs |
| Free instance sleeps | First visit after idle takes ~1 min | Paid instance |
| Catalogue streams from archive.org unless mirrored | Up to 30 s to first byte | Run the mirror pass |
| Uploads cross the network twice | Slow uploads | Presigned browser-to-R2 upload |
| Five curated titles remain unmirrored | Those play slowly | Raise `--mirror-max-mb` and re-run |
| `Movie` rows have no cast, director or genres | Sparse detail pages | Wire up `MOVIE_METADATA_PROVIDER=tmdb` with a key |
