# Local Setup

This project runs entirely on self-hosted infrastructure — Postgres (via Prisma),
MinIO (S3-compatible object storage), and Redis, all managed through Docker Compose.
**No Supabase account, project, or credentials are needed anywhere in this flow.**

## Prerequisites

- Docker (with Docker Compose)
- Node.js and npm
- On Windows only: if `apps/worker`'s `canvas` native module needs to be built or
  rebuilt, see the Windows GTK/Cairo/vcpkg setup note in
  `docs/superpowers/plans/2026-07-23-real-estate-video-generator-plan.md`
  ("Post-plan notes") first.

## Setup sequence

1. **Start infrastructure services** (Redis, Postgres, MinIO) from the repo root:

   ```
   docker compose up -d
   ```

   MinIO's `property-photos` and `property-videos` buckets are created
   automatically by the `minio-init` one-shot service defined in
   `docker-compose.yml` — no manual bucket creation step needed.

2. **Copy the env example files** and adjust as needed (the defaults already match
   the `docker-compose.yml` service ports/credentials):

   ```
   cp .env.example .env
   cp apps/web/.env.local.example apps/web/.env.local
   cp apps/worker/.env.example apps/worker/.env
   cp packages/db/.env.example packages/db/.env
   ```

   The `packages/db/.env` copy is required even though `packages/db/.env` looks
   redundant with the root `.env` — Prisma's `dotenv` loading is cwd-relative, so
   running `npx prisma` commands from inside `packages/db` only picks up a `.env`
   in that directory.

3. **Apply the database schema and generate the Prisma client**, from `packages/db`:

   ```
   cd packages/db
   npx prisma migrate deploy
   npx prisma generate
   ```

4. **(Windows only, if `canvas` was just rebuilt)** restore the runtime DLLs
   `apps/worker`'s `canvas` module needs at load time:

   ```
   bash scripts/fix-canvas-windows.sh
   ```

   Skip this step unless you just ran `npm install` or `npm rebuild canvas` on
   Windows — see the Post-plan notes in the original plan doc for why this is
   needed.

5. **Start the apps**, each in its own terminal:

   ```
   cd apps/web && npm run dev
   ```

   ```
   cd apps/worker && npm run dev
   ```

That's it — a fresh clone should be fully runnable locally after these steps, with
no external account signup required.

## Services reference

| Service  | Local port(s)   | Notes                                        |
|----------|-----------------|-----------------------------------------------|
| Postgres | `5434` (host) → `5432` (container) | Credentials in `docker-compose.yml` / `DATABASE_URL` |
| MinIO    | `9000` (S3 API), `9001` (console)  | Default credentials `minioadmin`/`minioadmin` |
| Redis    | `6379`          | Used for job queues                           |

For the history of why this replaced Supabase, see
`docs/superpowers/plans/2026-07-24-supabase-to-postgres-minio-migration-plan.md`.
