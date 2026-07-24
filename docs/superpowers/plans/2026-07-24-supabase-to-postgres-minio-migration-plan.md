# Migrate off Supabase: Postgres (Prisma) + MinIO Implementation Plan

## Why

Final whole-branch review of the original plan found the app has no RLS/auth
story: the browser holds direct DB write access via Supabase's anon key, and
Storage uploads are denied by default RLS on any fresh Supabase project. The
project owner decided against Supabase (and Firebase) entirely for this
internal tool, preferring a fully self-hosted local stack: Postgres for
relational data, MinIO (S3-compatible, self-hosted, not AWS) for file
storage. Moving all data access behind Next.js API routes (which this swap
requires, since browsers can't speak Postgres wire protocol) closes the RLS
gap as a side effect of the architecture, not a bolted-on policy.

## Global Constraints

- No Supabase, no Firebase, no other hosted BaaS. Everything self-hosted via
  Docker Compose (Postgres, MinIO, Redis — Redis unchanged from the original
  plan).
- Storage access uses the S3 API (`@aws-sdk/client-s3`) against MinIO's
  S3-compatible endpoint — never MinIO's proprietary SDK — so a future move
  to real S3/R2/B2 is a config change, not a rewrite.
- All Postgres access goes through Prisma. No table is queried directly from
  the browser; every read/write goes through a Next.js API route running
  server-side Prisma.
- Preserve every existing behavior and Global Constraint from the original
  plan (`docs/superpowers/plans/2026-07-23-real-estate-video-generator-plan.md`):
  variant dimensions, one `property_videos` row per variant, duration/zoom/
  caption formulas, worker single-attempt/no-retry, temp dir cleanup, plain
  v1 styling. This plan only swaps the persistence/storage layer — no
  product behavior changes.
- `RenderJobDeps` (apps/worker/src/renderJob.ts) is the existing seam
  between worker orchestration and its dependencies — reuse it unchanged;
  only the implementation behind it swaps.
- Existing tests currently passing (18/18 web vitest, worker suites) must
  keep passing after the swap; tests exercising Supabase-specific mocks get
  rewritten against Prisma/S3 mocks, not deleted silently.

## Current Supabase Surface (files touched by this migration)

- `supabase/migrations/0001_init.sql` — schema (properties, property_images,
  property_videos)
- `apps/worker/src/supabaseDeps.ts`, `apps/worker/src/index.ts`
- `apps/web/src/lib/supabaseServer.ts`, `apps/web/src/lib/supabaseBrowser.ts`
- `apps/web/src/app/api/properties/[id]/generate/route.ts` (+ its test)
- `apps/web/src/app/api/videos/[id]/stream/route.ts`
- `apps/web/src/components/ImageUploader.tsx` (client-side Supabase calls)
- `apps/web/src/components/ImageList.tsx` (client-side Supabase calls)
- `apps/web/src/components/VideoStatusList.tsx` (client-side Supabase calls
  + realtime subscription — already noted as inert in final review since the
  publication was never configured; dropped in this migration, 3s polling
  fallback becomes the only mechanism, which is what actually worked before)
- `apps/web/src/app/properties/[id]/page.tsx` (client-side Supabase read)
- `docker-compose.yml` (Redis only, needs postgres + minio added)
- `.env.example` files (both apps)

---

### Task 1: Infra — Postgres + MinIO in Docker Compose, Prisma schema

**Files:** `docker-compose.yml`, `packages/db/package.json`,
`packages/db/prisma/schema.prisma`, `packages/db/src/client.ts`,
`packages/db/tsconfig.json`, root `package.json` (workspace + prisma dep),
delete `supabase/` directory.

Add to `docker-compose.yml`:

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: realestatevids
      POSTGRES_PASSWORD: localdev
      POSTGRES_DB: realestatevids
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio-data:/data

volumes:
  postgres-data:
  minio-data:
```

New package `packages/db` (mirrors `packages/shared`'s existing structure —
check its `package.json`/`tsconfig.json` for the workspace pattern already
in use before writing this one):

`packages/db/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Property {
  id             String   @id @default(uuid())
  name           String
  contactPhone   String   @map("contact_phone")
  contactWebsite String   @map("contact_website")
  agencyName     String?  @map("agency_name")
  createdAt      DateTime @default(now()) @map("created_at")

  images PropertyImage[]
  videos PropertyVideo[]

  @@map("properties")
}

model PropertyImage {
  id            String   @id @default(uuid())
  propertyId    String   @map("property_id")
  imageUrl      String   @map("image_url")
  roomType      String   @map("room_type")
  displayOrder  Int      @map("display_order")
  zoomDirection String?  @map("zoom_direction")
  createdAt     DateTime @default(now()) @map("created_at")

  property Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)

  @@index([propertyId])
  @@map("property_images")
}

model PropertyVideo {
  id          String    @id @default(uuid())
  propertyId  String    @map("property_id")
  variant     String
  status      String
  outputUrl   String?   @map("output_url")
  errorMessage String?  @map("error_message")
  createdAt   DateTime  @default(now()) @map("created_at")
  completedAt DateTime? @map("completed_at")

  property Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)

  @@index([propertyId])
  @@map("property_videos")
}
```

`packages/db/src/client.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

let client: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (!client) {
    client = new PrismaClient();
  }
  return client;
}

export type { Property, PropertyImage, PropertyVideo } from '@prisma/client';
```

Add `zoom_direction` check constraint (`in ('in','out')`) and `variant`/
`status` check constraints as a raw SQL migration addition — Prisma schema
above doesn't encode CHECK constraints; add them via
`packages/db/prisma/migrations/<timestamp>_init/migration.sql` after running
`npx prisma migrate dev --name init` against the dockerized Postgres, by
hand-editing the generated migration to add:

```sql
ALTER TABLE property_images ADD CONSTRAINT property_images_zoom_direction_check CHECK (zoom_direction IN ('in', 'out'));
ALTER TABLE property_videos ADD CONSTRAINT property_videos_variant_check CHECK (variant IN ('vertical', 'landscape'));
ALTER TABLE property_videos ADD CONSTRAINT property_videos_status_check CHECK (status IN ('queued', 'processing', 'done', 'failed'));
```

Delete `supabase/` directory entirely (schema now lives in
`packages/db/prisma`).

Add root `.env.example` (or update existing ones) with:

```
DATABASE_URL=postgresql://realestatevids:localdev@localhost:5432/realestatevids
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_PHOTOS_BUCKET=property-photos
MINIO_VIDEOS_BUCKET=property-videos
```

**Step 1: Write and run the plan**
1. Add postgres + minio services to `docker-compose.yml` as above.
2. `docker compose up -d postgres minio`.
3. Scaffold `packages/db` following `packages/shared`'s existing
   package.json/tsconfig pattern; add `prisma` and `@prisma/client` as deps.
4. Write `prisma/schema.prisma` as above.
5. `npx prisma migrate dev --name init` (from `packages/db`, with
   `DATABASE_URL` pointing at the dockerized Postgres) to generate the SQL
   migration and Prisma client.
6. Hand-edit the generated migration SQL to add the three CHECK constraints
   above (Prisma won't emit these from the schema alone).
7. Re-run `npx prisma migrate reset` (or `deploy`) to confirm the edited
   migration applies cleanly from scratch.
8. Delete `supabase/` directory.
9. Add `.env.example` entries for `DATABASE_URL` and `MINIO_*` vars in both
   `apps/web/.env.local.example` and `apps/worker/.env.example` (check
   existing filenames from Tasks 5/9 of the original plan).

**Step 2: Verify**
- `docker compose ps` shows postgres and minio healthy.
- `npx prisma studio` (from `packages/db`) connects and shows the three
  empty tables with correct column names (snake_case, matching `@map`).
- Manually insert a test row via `psql` or Prisma Studio and confirm the
  CHECK constraints reject an invalid `variant`/`status`/`zoom_direction`.

---

### Task 2: `apps/worker` — swap Supabase deps for Prisma + S3

**Files:** `apps/worker/src/dbDeps.ts` (new, replaces `supabaseDeps.ts`),
`apps/worker/src/storageClient.ts` (new), `apps/worker/src/index.ts`,
`apps/worker/package.json` (remove `@supabase/supabase-js`, add
`@aws-sdk/client-s3`, `@realestatevids/db` workspace dep), delete
`apps/worker/src/supabaseDeps.ts`.

`RenderJobDeps` interface (in `renderJob.ts`, already built in Task 7 of the
original plan) does not change — only its implementation. Read
`apps/worker/src/renderJob.ts` first to confirm the exact interface shape
before writing the replacement.

`apps/worker/src/storageClient.ts`:

```typescript
import { S3Client } from '@aws-sdk/client-s3';

export function buildS3Client() {
  return new S3Client({
    endpoint: process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
      secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
    },
  });
}
```

`apps/worker/src/dbDeps.ts` — implement every `RenderJobDeps` method:

- `fetchProperty(propertyId)`: `prisma.property.findUniqueOrThrow({ where: { id: propertyId } })`
- `fetchOrderedImages(propertyId)`: `prisma.propertyImage.findMany({ where: { propertyId }, orderBy: { displayOrder: 'asc' } })`
- `downloadImage(imageUrl, destPath)`: `GetObjectCommand` against
  `MINIO_PHOTOS_BUCKET`, stream body to `destPath` via `fs.writeFile` (body
  is a `Readable` from the SDK — convert via
  `Buffer.concat(await stream.toArray())` or `node:stream/consumers`'
  `buffer()` helper)
- `runEditly(config)`: unchanged, `await editly(config)`
- `uploadVideo(localPath, propertyVideoId)`: `PutObjectCommand` against
  `MINIO_VIDEOS_BUCKET`, key `${propertyVideoId}.mp4`, `ContentType:
  'video/mp4'`; return the key (same contract as the Supabase version
  returning `storagePath`)
- `updateVideoStatus(propertyVideoId, patch)`: `prisma.propertyVideo.update({ where: { id: propertyVideoId }, data: patch })`
  — note Prisma field names are camelCase (`outputUrl`, `errorMessage`),
  but `RenderJobDeps`'s patch type uses whatever `renderJob.ts` already
  defines; map field names explicitly rather than passing the patch through
  raw if the casing differs.
- `makeTempDir` / `removeTempDir`: unchanged from `supabaseDeps.ts`
  (pure `node:fs/promises`, no Supabase involvement).

Error handling: keep the same "throw descriptive Error" pattern as
`supabaseDeps.ts` for consistency (`fetchProperty failed: ...`, etc.) so
`error_message` values written to `property_videos` stay informative.

`apps/worker/src/index.ts`: change the import from `./supabaseDeps` /
`buildSupabaseDeps` to `./dbDeps` / `buildDbDeps` (or whatever name you
give the constructed-deps factory — keep it symmetric with the old name).

**Step 1: Write tests first (TDD)**

Existing worker tests (`buildEditlyConfig.test.ts`, `renderJob.test.ts`)
mock `RenderJobDeps` directly and are unaffected by this swap — do not
touch them. This task has no new pure-logic tests beyond what Task 7
already covered, since `dbDeps.ts`/`storageClient.ts` is wiring, same as
the original `supabaseDeps.ts` was (per the original plan's Task 8, which
also had no new tests — pure dependency wiring, verified by typecheck +
manual smoke test).

**Step 2: Implement**

Write `storageClient.ts` and `dbDeps.ts` as specified. Update `index.ts`'s
import.

**Step 3: Verify**

1. `npx tsc --noEmit` in `apps/worker` — clean.
2. `npx vitest run apps/worker` — existing 5 tests still pass unmodified.
3. Manual smoke test (same shape as the original plan's Task 8 Step 3):
   with `docker compose up -d redis postgres minio` running, seed one
   `Property` + one `PropertyImage` row via Prisma Studio or a script,
   upload a real photo to the MinIO bucket at that image's `imageUrl` key,
   start the worker (`npx tsx src/index.ts` or `npm run dev`), enqueue a
   job for that property (can reuse Task 10's generate endpoint once Task
   3 below is done, or enqueue directly via a one-off script using
   `enqueueRenderJob`), and confirm a real mp4 lands in the videos bucket
   and the `property_videos` row transitions to `status: 'done'`.

---

### Task 3: `apps/web` — Prisma + S3 server clients, rewrite generate/stream routes

**Files:** `apps/web/src/lib/db.ts` (new, replaces `supabaseServer.ts`),
`apps/web/src/lib/storage.ts` (new, S3 client + presigned URL helpers),
`apps/web/src/app/api/properties/[id]/generate/route.ts` (rewrite),
`apps/web/src/app/api/properties/[id]/generate/route.test.ts` (rewrite
mocks), `apps/web/src/app/api/videos/[id]/stream/route.ts` (rewrite),
`apps/web/package.json` (remove `@supabase/supabase-js`, add
`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`,
`@realestatevids/db` workspace dep), delete `apps/web/src/lib/
supabaseServer.ts` and `apps/web/src/lib/supabaseBrowser.ts` (browser client
deletion happens here since no server file should import it once routes
stop needing it, but keep it until Task 4 finishes removing browser
callers, to avoid breaking the build mid-task — coordinate: this task
rewrites the two routes; Task 4 rewrites the components; only delete both
supabase lib files at the end of Task 4 once nothing imports them).

`apps/web/src/lib/db.ts`:

```typescript
export { getPrismaClient as getDb } from '@realestatevids/db';
```

(Or import `packages/db`'s exported client directly if the workspace
package exports it as a singleton already — match whatever `packages/db`
ends up exporting from Task 1.)

`apps/web/src/lib/storage.ts`:

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export function getS3Client() {
  return new S3Client({
    endpoint: process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
      secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
    },
  });
}

export async function getPresignedUploadUrl(bucket: string, key: string, contentType: string) {
  const client = getS3Client();
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  return getSignedUrl(client, command, { expiresIn: 300 });
}

export async function getPresignedDownloadUrl(bucket: string, key: string, expiresInSeconds = 600) {
  const client = getS3Client();
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}
```

Rewrite `generate/route.ts`: replace the Supabase count/insert calls with
Prisma equivalents (`prisma.propertyImage.count({ where: { propertyId } })`,
`prisma.propertyVideo.create({ data: { propertyId, variant, status:
'queued' } })`). Keep the exact same variant-selection logic (the
`requestedVariant` / `wantsLandscape` branching from the Task-12 retry fix)
unchanged — this is pure persistence-layer swap, not a logic change.

Rewrite `stream/route.ts`: replace the Supabase `select` + `createSignedUrl`
calls with `prisma.propertyVideo.findUniqueOrThrow` for `outputUrl`, then
`getPresignedDownloadUrl(VIDEOS_BUCKET, outputUrl)` from `storage.ts`,
redirecting to the presigned URL exactly as before.

**Step 1: Write tests first (TDD)**

Rewrite `generate/route.test.ts`: replace `vi.hoisted` Supabase client mocks
with Prisma client mocks (`vi.mock('@realestatevids/db', () => ({ getDb: ()
=> mockPrismaClient }))` — mock `propertyImage.count`, `propertyVideo.create`
per test case) and a mock for `enqueueRenderJob` (already mocked in the
existing test — keep that part). Preserve every existing test case
(insufficient images returns 400, single variant creates one row + one
job, landscape checkbox creates two rows + two jobs, explicit `variant` in
body scopes to one — this last case is the Task-12 retry-fix test, keep its
regression coverage intact per the final review's note about
`route.test.ts:68`, and consider fixing that test's title/body mismatch
noted in the Task 12 review while you're rewriting this file: the title
claims "even if landscape flag is also true" but never sets `landscape:
true` in the same request body — add it if it's a one-line fix per the
review's suggestion).

**Step 2: Implement**

Write `db.ts`, `storage.ts`, rewrite both routes.

**Step 3: Verify**

1. `npx vitest run apps/web` — rewritten generate route tests pass (same
   count as before).
2. `npx tsc --noEmit -p apps/web/tsconfig.json` — clean.

---

### Task 4: `apps/web` — move image CRUD to API routes, rewrite components

This is the task that actually removes direct browser database access,
closing the RLS gap identified in the final review — not by adding
policies, but by making direct browser DB access architecturally
impossible (Postgres has no browser-safe client; every write must go
through a Next.js route running server-side Prisma).

**New API routes:**

- `GET /api/properties/[id]/images` — list images for a property, ordered
  by `displayOrder` (replaces `page.tsx`'s direct `loadImages` Supabase
  call)
- `POST /api/properties/[id]/images` — body `{ fileName, contentType }`,
  returns `{ uploadUrl, imageId }`: creates a `PropertyImage` row with a
  generated storage key (`${propertyId}/${crypto.randomUUID()}-${fileName}`)
  and `roomType: 'bedroom'` default (same default as the current
  `ImageUploader`), computes `displayOrder` server-side via
  `Math.max` over existing rows + 1 (reuse the Task-11 collision fix's
  logic — do not regress to `images.length`), then returns a presigned S3
  PUT URL via `getPresignedUploadUrl` for the client to upload the actual
  file bytes directly to MinIO (keeps large file uploads off the Next.js
  server, matching the direct-to-storage pattern the Supabase version used)
- `PATCH /api/properties/[id]/images/[imageId]` — body `{ roomType }`,
  updates one row (replaces `ImageList`'s `updateRoomType`)
- `DELETE /api/properties/[id]/images/[imageId]` — deletes one row
  (replaces `ImageList`'s `deleteImage`)
- `PATCH /api/properties/[id]/images/reorder` — body `{ orderedIds:
  string[] }`, updates `displayOrder` for each id to its array index in a
  single `prisma.$transaction` (replaces `ImageList`'s `reorder`, which
  currently does N unbatched updates — the transaction is a genuine
  improvement, not scope creep, since it's the natural Prisma idiom for
  "update N rows atomically" and was already implicitly assumed by the
  original code's `Promise.all`)
- `GET /api/properties/[id]/videos` — list videos for a property, ordered
  by `createdAt` desc (replaces `VideoStatusList`'s direct Supabase read;
  the realtime subscription is dropped per the Global Constraints note
  above — component keeps its existing 3s polling `setInterval` against
  this new endpoint)

**Rewrite components** to call these routes via `fetch` instead of
`getSupabaseBrowserClient()`:

- `ImageUploader.tsx`: `POST /api/properties/[id]/images` to get the
  presigned URL + created row, then `fetch(uploadUrl, { method: 'PUT',
  body: file, headers: { 'Content-Type': file.type } })` to push bytes
  directly to MinIO. Keep the existing per-file loop and `onUploaded`
  callback contract unchanged.
- `ImageList.tsx`: `updateRoomType` → `PATCH .../images/[id]`;
  `deleteImage` → `DELETE .../images/[id]`; `reorder` → single `PATCH
  .../images/reorder` call with the full reordered id array (replaces the
  current N-request `Promise.all`).
- `page.tsx`: `loadImages` → `GET /api/properties/[id]/images`.
- `VideoStatusList.tsx`: `load` → `GET /api/properties/[id]/videos`; remove
  the `supabase.channel(...)` realtime block entirely (dead code per the
  final review — the publication was never configured, so this is a true
  removal of non-functional code, not a behavior regression); keep the 3s
  `setInterval` poll, which is what was actually working.

Once all four components are converted, delete
`apps/web/src/lib/supabaseServer.ts` and
`apps/web/src/lib/supabaseBrowser.ts`, and remove `@supabase/supabase-js`
from `apps/web/package.json` and `apps/worker/package.json` (confirm no
remaining import anywhere with a repo-wide grep before deleting).

**Step 1: Write tests first (TDD)**

No route test files exist yet for `[id]/images*` — write vitest suites
following the same pattern as `generate/route.test.ts` (mock `@realestatevids/db`'s
`getDb`, mock `storage.ts`'s presign helpers). Cover: list returns ordered
images; create computes `displayOrder` via `Math.max`+1 (not `.length`,
regression-testing the Task-11 fix in the new location); patch updates
`roomType`; delete removes a row; reorder updates all rows' `displayOrder`
to match array index in one transaction call.

**Step 2: Implement**

Write the five new route files, then rewrite the four components/page to
call them.

**Step 3: Verify**

1. `npx vitest run apps/web` — new route tests pass, existing tests
   (generate, stream) still pass.
2. `npx tsc --noEmit -p apps/web/tsconfig.json` — clean.
3. `npm run build` (apps/web) succeeds.
4. Manual check: `npm run dev` (apps/web) with docker compose services up,
   navigate to a property page, upload a photo (confirm it lands in MinIO
   via the MinIO console at `:9001`), edit its room type, reorder two
   images by drag, delete one, click Generate, confirm a `property_videos`
   row appears with polling status updates.

---

### Task 5: Update tests and remove dead Supabase test scaffolding

**Files:** repo-wide grep for `supabase` across `apps/**/*.test.ts` and
`vitest.config.ts` / `vitest.setup.ts` (if any Supabase-specific mock setup
exists at the config level, not just per-test).

By this point Tasks 2-4 already rewrote every test file that directly
mocked Supabase. This task is a sweep, not new implementation:

1. Repo-wide `grep -r supabase apps packages --include='*.ts' --include='*.tsx'`
   (excluding `node_modules`) should return zero matches. Fix any stragglers.
2. Repo-wide `grep -r "@supabase" apps/*/package.json` should return zero
   matches.
3. Run the full test suite (`npm test` at the root, or the equivalent
   workspace-wide vitest command established in Task 1 of the original
   plan) and confirm everything passes.
4. Run `npx tsc --noEmit` across every package/app (root-level script if one
   exists, or per-package).

**Verify:** full green test run, zero Supabase references anywhere outside
this plan's own docs (which document history, not live code).

---

### Task 6: Documentation — update plan/README/env examples

**Files:** `docs/superpowers/plans/2026-07-23-real-estate-video-generator-plan.md`
(Post-plan notes section), root `README.md` if one exists, `.env.example`
files in both apps.

1. Add a note to the original plan's Post-plan notes section pointing at
   this migration plan and stating that Supabase was replaced with
   Postgres+Prisma+MinIO — don't rewrite the original plan's now-historical
   Supabase-specific task text (Tasks 2, 8-12 still accurately describe
   what was built *at the time*; a forward pointer is enough, rewriting
   history creates confusion about what commit introduced what).
2. Update both apps' `.env.example` files: remove
   `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, add `DATABASE_URL` and `MINIO_*` vars
   per Task 1.
3. Document the `docker compose up -d` / `npx prisma migrate deploy` /
   `npm run dev` local setup sequence somewhere discoverable (README or a
   new `docs/local-setup.md`) since there's no more "create a Supabase
   project" manual step — this is a genuine new onboarding requirement
   worth writing down once.
4. Leave the Windows GTK/Cairo/vcpkg note (added for Task 8's canvas native
   build) untouched — it's unrelated to this migration and still applies.

**Verify:** a fresh clone + `docker compose up -d` + `npx prisma migrate
deploy` (from `packages/db`) + `npm run dev` (both apps) should work
end-to-end with no Supabase account or credentials anywhere.
