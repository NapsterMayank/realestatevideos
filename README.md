# Real Estate Vids

Turns a property's listing photos into a short marketing video — upload photos,
pick a room order, hit generate.

## Structure

- `apps/web` — Next.js app: property upload UI, image management, video generation trigger
- `apps/worker` — background job worker: renders the video (editly) from uploaded images
- `packages/db` — Prisma schema/client, shared across web and worker
- `packages/shared` — shared TypeScript types/helpers

## Running it locally

Full setup steps live in [`docs/local-setup.md`](docs/local-setup.md). Quick version:

```
docker compose up -d
cp .env.example .env
cp apps/web/.env.local.example apps/web/.env.local
cp apps/worker/.env.example apps/worker/.env
cp packages/db/.env.example packages/db/.env
cd packages/db && npx prisma migrate deploy && npx prisma generate && cd ../..
cd apps/web && npm run dev    # terminal 1
cd apps/worker && npm run dev # terminal 2
```

No Supabase or other external account needed — Postgres, MinIO, and Redis run via
Docker Compose.
