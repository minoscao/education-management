# Education Management Portal

Teaching operations portal for Malaysia-based tuition and enrichment centres.

The app is a Cloudflare Worker application with:

- Next.js-style app routes through `vinext`
- Cloudflare D1 as the shared database
- Drizzle migrations in `drizzle/`
- Static images and frontend assets served by the Worker assets binding

## Local Setup

Requirements:

- Node.js `>=22.13.0`
- A Cloudflare account when deploying

Install and run:

```bash
npm install
npm run dev
```

Verify a production build:

```bash
npm test
```

## Cloudflare Setup

### 1. Create the D1 database

In Cloudflare, create a D1 database. Recommended name:

```text
education-management-db
```

Copy the database ID into `wrangler.jsonc`:

```json
{
  "binding": "DB",
  "database_name": "education-management-db",
  "database_id": "YOUR_REAL_D1_DATABASE_ID"
}
```

The binding name must stay as:

```text
DB
```

### 2. Apply database migrations

For local testing:

```bash
npm run db:migrate:local
```

For the real Cloudflare D1 database:

```bash
npm run db:migrate:remote
```

### 3. Preview the Cloudflare Worker locally

```bash
npm run cf:preview
```

### 4. Deploy manually

```bash
npm run cf:deploy
```

## GitHub + Cloudflare Deployment

Repository:

[minoscao/education-management](https://github.com/minoscao/education-management)

You can deploy in either way:

### Option A: Cloudflare Dashboard

Use Cloudflare Workers Builds and connect the GitHub repository.

Recommended settings:

- Framework preset: none / custom
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy --config dist/server/wrangler.json`
- Node version: `22`
- D1 binding: `DB`

Before the first production deployment, apply migrations once:

```bash
npm run db:migrate:remote
```

### Option B: GitHub Actions

Use `.github/workflows/cloudflare-deploy.yml`.

Add these GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The workflow builds the app, applies D1 migrations, and deploys the Worker.

## Useful Commands

```bash
npm run dev                 # local development
npm run build               # production build
npm test                    # build + rendered HTML check
npm run db:generate         # generate migrations after schema changes
npm run db:migrate:local    # apply migrations to local D1
npm run db:migrate:remote   # apply migrations to Cloudflare D1
npm run cf:preview          # build and preview Worker locally
npm run cf:deploy           # build and deploy Worker to Cloudflare
```

## Data Model Direction

The portal uses a shared database model:

- Storage/setup layer: course catalogue, reusable lesson plan, teachers, students, campuses, classrooms, rules
- Runtime/operations layer: class intakes, scheduled lessons, room bookings, teacher bookings, student enrollments, invoices, payments, attendance, notifications

Current prototype seed data is still present for first-run testing. Before real school data goes live, remove or gate the sample seed path in `app/api/portal-data/route.ts`.
