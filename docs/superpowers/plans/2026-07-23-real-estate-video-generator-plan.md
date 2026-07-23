# Real Estate Listing Video Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js upload/tagging UI + BullMQ/Editly worker that turns tagged
property photos into a Ken Burns slideshow mp4 (vertical and optional landscape)
with room captions and a black contact-details outro.

**Architecture:** npm-workspaces monorepo. `packages/shared` holds DB types and pure
helpers (duration, zoom alternation, caption formatting) with no runtime deps beyond
TypeScript, imported directly as TS source (no build step) by both `apps/web`
(Next.js, transpiles workspace packages) and `apps/worker` (run via `tsx`). Redis
runs locally via `docker-compose` for BullMQ. Supabase Postgres holds `properties`,
`property_images`, `property_videos`; Supabase Storage holds original photos and
rendered mp4s.

**Tech Stack:** Next.js (App Router, TS), Supabase JS client, BullMQ + ioredis,
Editly (JS API) + ffmpeg, vitest, tsx, Docker Compose (Redis).

## Global Constraints

- Vertical (1080x1920) and landscape (1920x1080) variants, landscape only when user checks the box at generate time.
- `property_videos` has one row per variant per generation (`variant` column: `vertical` | `landscape`).
- Per-photo duration: `clamp(50 / numPhotos, 1.5, 3)` seconds; outro fixed at 5s.
- Zoom direction: manual `zoom_direction` override wins; else alternate `in`/`out` by sequence index starting with `in` at index 0.
- Room type caption: capitalize first letter only, rest unchanged.
- Room type input: preset dropdown (bedroom, kitchen, living room, bathroom, exterior, balcony, dining room) + free text custom label allowed.
- No AI-generated video motion, no automatic room classification, no simulated multi-room walkthrough/camera transitions.
- Worker: single attempt per job (no BullMQ retries); failures set `status='failed'` + `error_message`; temp dirs always cleaned up in `finally`.
- Plain default styling for v1 (system font, white text, no logo/brand color).

---

### Task 1: Monorepo scaffold + Redis

**Files:**
- Create: `package.json` (root)
- Create: `tsconfig.base.json`
- Create: `docker-compose.yml`
- Create: `.gitignore`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: npm workspaces `packages/*` and `apps/*`; root `test` script running vitest; Redis reachable at `redis://localhost:6379` when `docker compose up -d` is run.

- [ ] **Step 1: Init git repo and root package.json**

```bash
cd "D:/personal/realEstateVids"
git init
```

`package.json`:
```json
{
  "name": "real-estate-vids",
  "private": true,
  "version": "0.0.0",
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.6.2",
    "vitest": "^2.1.1",
    "tsx": "^4.19.1"
  }
}
```

- [ ] **Step 2: Add base tsconfig**

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 3: Add docker-compose for Redis**

`docker-compose.yml`:
```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

- [ ] **Step 4: Add .gitignore**

`.gitignore`:
```
node_modules/
.next/
dist/
*.log
.env
.env.local
```

- [ ] **Step 5: Add root vitest config**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/worker/**/*.test.ts', 'apps/web/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**'],
  },
});
```

- [ ] **Step 6: Install root deps and verify Redis**

```bash
npm install
docker compose up -d
docker compose ps
```
Expected: `redis` container listed as running.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.base.json docker-compose.yml .gitignore vitest.config.ts package-lock.json
git commit -m "chore: scaffold monorepo, redis, vitest"
```

---

### Task 2: Supabase schema migration

**Files:**
- Create: `supabase/migrations/0001_init.sql`

**Interfaces:**
- Produces: `properties`, `property_images`, `property_videos` tables used by every later task's types and queries.

- [ ] **Step 1: Write migration SQL**

`supabase/migrations/0001_init.sql`:
```sql
create table properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_phone text not null,
  contact_website text not null,
  agency_name text,
  created_at timestamptz not null default now()
);

create table property_images (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  image_url text not null,
  room_type text not null,
  display_order integer not null,
  zoom_direction text check (zoom_direction in ('in', 'out')),
  created_at timestamptz not null default now()
);

create index property_images_property_id_idx on property_images(property_id);

create table property_videos (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  variant text not null check (variant in ('vertical', 'landscape')),
  status text not null check (status in ('queued', 'processing', 'done', 'failed')),
  output_url text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index property_videos_property_id_idx on property_videos(property_id);
```

- [ ] **Step 2: Apply migration**

If using Supabase CLI locally:
```bash
supabase db reset
```
If using a hosted Supabase project, paste `0001_init.sql` into the SQL editor and run it.
Expected: three tables visible in the Supabase table editor, no errors.

- [ ] **Step 3: Create storage buckets**

In Supabase Studio -> Storage, create two buckets: `property-photos` and
`property-videos` (both private; the web app will use signed URLs).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat: add supabase schema for properties, images, videos"
```

---

### Task 3: `packages/shared` — types and duration formula

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/duration.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/src/duration.test.ts`

**Interfaces:**
- Produces:
  - `RoomZoomDirection = 'in' | 'out'`
  - `interface Property { id: string; name: string; contact_phone: string; contact_website: string; agency_name: string | null; created_at: string; }`
  - `interface PropertyImage { id: string; property_id: string; image_url: string; room_type: string; display_order: number; zoom_direction: RoomZoomDirection | null; created_at: string; }`
  - `type VideoVariant = 'vertical' | 'landscape'`
  - `type VideoStatus = 'queued' | 'processing' | 'done' | 'failed'`
  - `interface PropertyVideo { id: string; property_id: string; variant: VideoVariant; status: VideoStatus; output_url: string | null; error_message: string | null; created_at: string; completed_at: string | null; }`
  - `interface RenderJobPayload { propertyVideoId: string; propertyId: string; width: number; height: number; }`
  - `calcPerPhotoDuration(numPhotos: number): number`
  - `estimateTotalRuntime(numPhotos: number): number`

- [ ] **Step 1: Create package.json**

`packages/shared/package.json`:
```json
{
  "name": "@realestatevids/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": { ".": "./src/index.ts" }
}
```

- [ ] **Step 2: Write types**

`packages/shared/src/types.ts`:
```ts
export type RoomZoomDirection = 'in' | 'out';

export interface Property {
  id: string;
  name: string;
  contact_phone: string;
  contact_website: string;
  agency_name: string | null;
  created_at: string;
}

export interface PropertyImage {
  id: string;
  property_id: string;
  image_url: string;
  room_type: string;
  display_order: number;
  zoom_direction: RoomZoomDirection | null;
  created_at: string;
}

export type VideoVariant = 'vertical' | 'landscape';
export type VideoStatus = 'queued' | 'processing' | 'done' | 'failed';

export interface PropertyVideo {
  id: string;
  property_id: string;
  variant: VideoVariant;
  status: VideoStatus;
  output_url: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface RenderJobPayload {
  propertyVideoId: string;
  propertyId: string;
  width: number;
  height: number;
}
```

- [ ] **Step 3: Write the failing test for duration formula**

`packages/shared/src/duration.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { calcPerPhotoDuration, estimateTotalRuntime } from './duration';

describe('calcPerPhotoDuration', () => {
  it('returns max 3s when few photos', () => {
    expect(calcPerPhotoDuration(1)).toBe(3);
    expect(calcPerPhotoDuration(16)).toBeCloseTo(3.125 > 3 ? 3 : 50 / 16);
  });

  it('scales down for many photos but floors at 1.5s', () => {
    expect(calcPerPhotoDuration(40)).toBe(1.5);
  });

  it('throws for zero or negative photo counts', () => {
    expect(() => calcPerPhotoDuration(0)).toThrow();
    expect(() => calcPerPhotoDuration(-1)).toThrow();
  });
});

describe('estimateTotalRuntime', () => {
  it('adds the 5s outro to photo runtime', () => {
    expect(estimateTotalRuntime(10)).toBe(10 * calcPerPhotoDuration(10) + 5);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npx vitest run packages/shared/src/duration.test.ts
```
Expected: FAIL — `./duration` module not found.

- [ ] **Step 5: Implement duration.ts**

`packages/shared/src/duration.ts`:
```ts
const OUTRO_SECONDS = 5;
const PHOTO_BUDGET_SECONDS = 50;
const MIN_PHOTO_DURATION = 1.5;
const MAX_PHOTO_DURATION = 3;

export function calcPerPhotoDuration(numPhotos: number): number {
  if (numPhotos <= 0) {
    throw new Error('numPhotos must be greater than 0');
  }
  const raw = PHOTO_BUDGET_SECONDS / numPhotos;
  return Math.min(MAX_PHOTO_DURATION, Math.max(MIN_PHOTO_DURATION, raw));
}

export function estimateTotalRuntime(numPhotos: number): number {
  return numPhotos * calcPerPhotoDuration(numPhotos) + OUTRO_SECONDS;
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npx vitest run packages/shared/src/duration.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 7: Create index.ts barrel export**

`packages/shared/src/index.ts`:
```ts
export * from './types';
export * from './duration';
```

- [ ] **Step 8: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add types and per-photo duration formula"
```

---

### Task 4: `packages/shared` — zoom alternation and caption formatting

**Files:**
- Create: `packages/shared/src/zoom.ts`
- Create: `packages/shared/src/caption.ts`
- Test: `packages/shared/src/zoom.test.ts`
- Test: `packages/shared/src/caption.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `RoomZoomDirection` from Task 3.
- Produces:
  - `resolveZoomDirection(index: number, override: RoomZoomDirection | null | undefined): RoomZoomDirection`
  - `formatRoomCaption(roomType: string): string`

- [ ] **Step 1: Write failing tests for zoom alternation**

`packages/shared/src/zoom.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolveZoomDirection } from './zoom';

describe('resolveZoomDirection', () => {
  it('alternates starting with in at index 0', () => {
    expect(resolveZoomDirection(0, null)).toBe('in');
    expect(resolveZoomDirection(1, null)).toBe('out');
    expect(resolveZoomDirection(2, null)).toBe('in');
    expect(resolveZoomDirection(3, undefined)).toBe('out');
  });

  it('manual override always wins', () => {
    expect(resolveZoomDirection(0, 'out')).toBe('out');
    expect(resolveZoomDirection(1, 'in')).toBe('in');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run packages/shared/src/zoom.test.ts
```
Expected: FAIL — `./zoom` module not found.

- [ ] **Step 3: Implement zoom.ts**

`packages/shared/src/zoom.ts`:
```ts
import type { RoomZoomDirection } from './types';

export function resolveZoomDirection(
  index: number,
  override: RoomZoomDirection | null | undefined
): RoomZoomDirection {
  if (override === 'in' || override === 'out') {
    return override;
  }
  return index % 2 === 0 ? 'in' : 'out';
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run packages/shared/src/zoom.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 5: Write failing tests for caption formatting**

`packages/shared/src/caption.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatRoomCaption } from './caption';

describe('formatRoomCaption', () => {
  it('capitalizes only the first letter', () => {
    expect(formatRoomCaption('bedroom')).toBe('Bedroom');
    expect(formatRoomCaption('living room')).toBe('Living room');
  });

  it('leaves already-capitalized text unchanged', () => {
    expect(formatRoomCaption('Kitchen')).toBe('Kitchen');
  });

  it('returns empty string unchanged', () => {
    expect(formatRoomCaption('')).toBe('');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npx vitest run packages/shared/src/caption.test.ts
```
Expected: FAIL — `./caption` module not found.

- [ ] **Step 7: Implement caption.ts**

`packages/shared/src/caption.ts`:
```ts
export function formatRoomCaption(roomType: string): string {
  if (!roomType) {
    return '';
  }
  return roomType.charAt(0).toUpperCase() + roomType.slice(1);
}
```

- [ ] **Step 8: Run test to verify it passes**

```bash
npx vitest run packages/shared/src/caption.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 9: Update barrel export**

`packages/shared/src/index.ts`:
```ts
export * from './types';
export * from './duration';
export * from './zoom';
export * from './caption';
```

- [ ] **Step 10: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add zoom alternation and caption formatting"
```

---

### Task 5: `apps/worker` scaffold — queue definition

**Files:**
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/.env.example`
- Create: `apps/worker/src/queue.ts`

**Interfaces:**
- Consumes: `RenderJobPayload` from `@realestatevids/shared`.
- Produces: `RENDER_QUEUE_NAME = 'render-video'`, `getRenderQueue(): Queue<RenderJobPayload>`, `getRedisConnection(): { host: string; port: number }`.

- [ ] **Step 1: Create package.json**

`apps/worker/package.json`:
```json
{
  "name": "@realestatevids/worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@realestatevids/shared": "*",
    "@supabase/supabase-js": "^2.45.4",
    "bullmq": "^5.13.2",
    "editly": "^0.14.2",
    "ioredis": "^5.4.1"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

`apps/worker/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create .env.example**

`apps/worker/.env.example`:
```
REDIS_HOST=localhost
REDIS_PORT=6379
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 4: Implement queue.ts**

`apps/worker/src/queue.ts`:
```ts
import { Queue } from 'bullmq';
import type { RenderJobPayload } from '@realestatevids/shared';

export const RENDER_QUEUE_NAME = 'render-video';

export function getRedisConnection() {
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  };
}

let queue: Queue<RenderJobPayload> | undefined;

export function getRenderQueue(): Queue<RenderJobPayload> {
  if (!queue) {
    queue = new Queue<RenderJobPayload>(RENDER_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return queue;
}
```

- [ ] **Step 5: Install worker deps**

```bash
npm install
```
Expected: no errors; `apps/worker/node_modules` (or root hoisted) resolves `editly`, `bullmq`, `ioredis`, `@supabase/supabase-js`.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/package.json apps/worker/tsconfig.json apps/worker/.env.example apps/worker/src/queue.ts package-lock.json
git commit -m "feat(worker): scaffold package and bullmq queue"
```

---

### Task 6: `apps/worker` — Editly config builder

**Files:**
- Create: `apps/worker/src/buildEditlyConfig.ts`
- Test: `apps/worker/src/buildEditlyConfig.test.ts`

**Interfaces:**
- Consumes: `Property`, `PropertyImage`, `calcPerPhotoDuration`, `resolveZoomDirection`, `formatRoomCaption` from `@realestatevids/shared`.
- Produces: `buildEditlyConfig(params: BuildEditlyConfigParams): EditlyConfig` where
  ```ts
  interface BuildEditlyConfigParams {
    outPath: string;
    width: number;
    height: number;
    images: PropertyImage[];       // ordered by display_order
    imagePaths: string[];          // local temp file path, same order/length as images
    property: Property;
  }
  ```
  Used by Task 7's `renderJob`.

- [ ] **Step 1: Write failing test**

`apps/worker/src/buildEditlyConfig.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildEditlyConfig } from './buildEditlyConfig';
import type { Property, PropertyImage } from '@realestatevids/shared';

const property: Property = {
  id: 'p1',
  name: '123 Main St',
  contact_phone: '+91 9999999999',
  contact_website: 'www.example.com',
  agency_name: 'Acme Realty',
  created_at: '2026-01-01T00:00:00Z',
};

function makeImage(overrides: Partial<PropertyImage>): PropertyImage {
  return {
    id: overrides.id ?? 'img1',
    property_id: 'p1',
    image_url: 'irrelevant',
    room_type: 'bedroom',
    display_order: 0,
    zoom_direction: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('buildEditlyConfig', () => {
  it('builds one clip per image plus a fixed outro clip', () => {
    const images = [
      makeImage({ id: 'a', room_type: 'bedroom', display_order: 0 }),
      makeImage({ id: 'b', room_type: 'kitchen', display_order: 1 }),
    ];
    const config = buildEditlyConfig({
      outPath: './out.mp4',
      width: 1080,
      height: 1920,
      images,
      imagePaths: ['/tmp/a.jpg', '/tmp/b.jpg'],
      property,
    });

    expect(config.outPath).toBe('./out.mp4');
    expect(config.width).toBe(1080);
    expect(config.height).toBe(1920);
    expect(config.clips).toHaveLength(3);

    const [clip1, clip2, outro] = config.clips;

    expect(clip1.layers[0]).toMatchObject({ type: 'image', path: '/tmp/a.jpg', zoomDirection: 'in' });
    expect(clip1.layers[1]).toMatchObject({ type: 'title', text: 'Bedroom', position: 'bottom' });
    expect(clip1.transition).toEqual({ name: 'fade' });

    expect(clip2.layers[0]).toMatchObject({ type: 'image', path: '/tmp/b.jpg', zoomDirection: 'out' });
    expect(clip2.layers[1]).toMatchObject({ type: 'title', text: 'Kitchen', position: 'bottom' });

    expect(outro.duration).toBe(5);
    expect(outro.layers[0]).toMatchObject({ type: 'fill-color', color: '#000000' });
    expect(outro.layers[1]).toMatchObject({
      type: 'title',
      text: 'Acme Realty\nContact us: +91 9999999999\nwww.example.com',
      position: 'center',
    });
  });

  it('respects manual zoom_direction override', () => {
    const images = [makeImage({ id: 'a', zoom_direction: 'out', display_order: 0 })];
    const config = buildEditlyConfig({
      outPath: './out.mp4',
      width: 1080,
      height: 1920,
      images,
      imagePaths: ['/tmp/a.jpg'],
      property,
    });
    expect(config.clips[0].layers[0]).toMatchObject({ zoomDirection: 'out' });
  });

  it('omits agency_name line when not set', () => {
    const images = [makeImage({ id: 'a', display_order: 0 })];
    const config = buildEditlyConfig({
      outPath: './out.mp4',
      width: 1080,
      height: 1920,
      images,
      imagePaths: ['/tmp/a.jpg'],
      property: { ...property, agency_name: null },
    });
    const outro = config.clips[config.clips.length - 1];
    expect(outro.layers[1]).toMatchObject({
      text: 'Contact us: +91 9999999999\nwww.example.com',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run apps/worker/src/buildEditlyConfig.test.ts
```
Expected: FAIL — `./buildEditlyConfig` module not found.

- [ ] **Step 3: Implement buildEditlyConfig.ts**

`apps/worker/src/buildEditlyConfig.ts`:
```ts
import {
  calcPerPhotoDuration,
  resolveZoomDirection,
  formatRoomCaption,
  type Property,
  type PropertyImage,
} from '@realestatevids/shared';

export interface BuildEditlyConfigParams {
  outPath: string;
  width: number;
  height: number;
  images: PropertyImage[];
  imagePaths: string[];
  property: Property;
}

export interface EditlyLayer {
  type: string;
  [key: string]: unknown;
}

export interface EditlyClip {
  duration: number;
  transition?: { name: string };
  layers: EditlyLayer[];
}

export interface EditlyConfig {
  outPath: string;
  width: number;
  height: number;
  clips: EditlyClip[];
}

export function buildEditlyConfig({
  outPath,
  width,
  height,
  images,
  imagePaths,
  property,
}: BuildEditlyConfigParams): EditlyConfig {
  const perPhotoDuration = calcPerPhotoDuration(images.length);

  const clips: EditlyClip[] = images.map((image, index) => ({
    duration: perPhotoDuration,
    transition: { name: 'fade' },
    layers: [
      {
        type: 'image',
        path: imagePaths[index],
        zoomDirection: resolveZoomDirection(index, image.zoom_direction),
      },
      {
        type: 'title',
        text: formatRoomCaption(image.room_type),
        position: 'bottom',
      },
    ],
  }));

  const contactLines = [property.agency_name, `Contact us: ${property.contact_phone}`, property.contact_website]
    .filter((line): line is string => Boolean(line))
    .join('\n');

  const outroClip: EditlyClip = {
    duration: 5,
    layers: [
      { type: 'fill-color', color: '#000000' },
      { type: 'title', text: contactLines, position: 'center' },
    ],
  };

  return { outPath, width, height, clips: [...clips, outroClip] };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run apps/worker/src/buildEditlyConfig.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/buildEditlyConfig.ts apps/worker/src/buildEditlyConfig.test.ts
git commit -m "feat(worker): build editly config from ordered property images"
```

---

### Task 7: `apps/worker` — render job orchestration

**Files:**
- Create: `apps/worker/src/renderJob.ts`
- Test: `apps/worker/src/renderJob.test.ts`

**Interfaces:**
- Consumes: `RenderJobPayload`, `Property`, `PropertyImage` from `@realestatevids/shared`; `buildEditlyConfig` from Task 6.
- Produces:
  ```ts
  interface RenderJobDeps {
    fetchProperty(propertyId: string): Promise<Property>;
    fetchOrderedImages(propertyId: string): Promise<PropertyImage[]>;
    downloadImage(imageUrl: string, destPath: string): Promise<void>;
    runEditly(config: EditlyConfig): Promise<void>;
    uploadVideo(localPath: string, propertyVideoId: string): Promise<string>; // returns storage path
    updateVideoStatus(propertyVideoId: string, patch: Partial<Pick<PropertyVideo, 'status' | 'output_url' | 'error_message' | 'completed_at'>>): Promise<void>;
    makeTempDir(): Promise<string>;
    removeTempDir(dir: string): Promise<void>;
  }
  async function renderJob(payload: RenderJobPayload, deps: RenderJobDeps): Promise<void>
  ```
  Used by Task 8's worker entrypoint.

- [ ] **Step 1: Write failing tests**

`apps/worker/src/renderJob.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { renderJob, type RenderJobDeps } from './renderJob';
import type { Property, PropertyImage, RenderJobPayload } from '@realestatevids/shared';

const property: Property = {
  id: 'p1',
  name: '123 Main St',
  contact_phone: '+91 9999999999',
  contact_website: 'www.example.com',
  agency_name: null,
  created_at: '2026-01-01T00:00:00Z',
};

const images: PropertyImage[] = [
  {
    id: 'img1',
    property_id: 'p1',
    image_url: 'storage/img1.jpg',
    room_type: 'bedroom',
    display_order: 0,
    zoom_direction: null,
    created_at: '2026-01-01T00:00:00Z',
  },
];

const payload: RenderJobPayload = {
  propertyVideoId: 'v1',
  propertyId: 'p1',
  width: 1080,
  height: 1920,
};

function makeDeps(overrides: Partial<RenderJobDeps> = {}): RenderJobDeps {
  return {
    fetchProperty: vi.fn().mockResolvedValue(property),
    fetchOrderedImages: vi.fn().mockResolvedValue(images),
    downloadImage: vi.fn().mockResolvedValue(undefined),
    runEditly: vi.fn().mockResolvedValue(undefined),
    uploadVideo: vi.fn().mockResolvedValue('property-videos/p1/v1.mp4'),
    updateVideoStatus: vi.fn().mockResolvedValue(undefined),
    makeTempDir: vi.fn().mockResolvedValue('/tmp/render-v1'),
    removeTempDir: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('renderJob', () => {
  it('marks processing, renders, uploads, and marks done', async () => {
    const deps = makeDeps();

    await renderJob(payload, deps);

    expect(deps.updateVideoStatus).toHaveBeenNthCalledWith(1, 'v1', { status: 'processing' });
    expect(deps.downloadImage).toHaveBeenCalledWith('storage/img1.jpg', expect.stringContaining('/tmp/render-v1'));
    expect(deps.runEditly).toHaveBeenCalledOnce();
    expect(deps.uploadVideo).toHaveBeenCalledWith(expect.stringContaining('/tmp/render-v1'), 'v1');
    expect(deps.updateVideoStatus).toHaveBeenNthCalledWith(2, 'v1', {
      status: 'done',
      output_url: 'property-videos/p1/v1.mp4',
      completed_at: expect.any(String),
    });
    expect(deps.removeTempDir).toHaveBeenCalledWith('/tmp/render-v1');
  });

  it('marks failed with error message and still cleans up temp dir on render error', async () => {
    const deps = makeDeps({
      runEditly: vi.fn().mockRejectedValue(new Error('ffmpeg exploded')),
    });

    await renderJob(payload, deps);

    expect(deps.updateVideoStatus).toHaveBeenNthCalledWith(2, 'v1', {
      status: 'failed',
      error_message: 'ffmpeg exploded',
    });
    expect(deps.removeTempDir).toHaveBeenCalledWith('/tmp/render-v1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run apps/worker/src/renderJob.test.ts
```
Expected: FAIL — `./renderJob` module not found.

- [ ] **Step 3: Implement renderJob.ts**

`apps/worker/src/renderJob.ts`:
```ts
import path from 'node:path';
import type { Property, PropertyImage, RenderJobPayload, PropertyVideo } from '@realestatevids/shared';
import { buildEditlyConfig, type EditlyConfig } from './buildEditlyConfig';

export interface RenderJobDeps {
  fetchProperty(propertyId: string): Promise<Property>;
  fetchOrderedImages(propertyId: string): Promise<PropertyImage[]>;
  downloadImage(imageUrl: string, destPath: string): Promise<void>;
  runEditly(config: EditlyConfig): Promise<void>;
  uploadVideo(localPath: string, propertyVideoId: string): Promise<string>;
  updateVideoStatus(
    propertyVideoId: string,
    patch: Partial<Pick<PropertyVideo, 'status' | 'output_url' | 'error_message' | 'completed_at'>>
  ): Promise<void>;
  makeTempDir(): Promise<string>;
  removeTempDir(dir: string): Promise<void>;
}

export async function renderJob(payload: RenderJobPayload, deps: RenderJobDeps): Promise<void> {
  const { propertyVideoId, propertyId, width, height } = payload;
  await deps.updateVideoStatus(propertyVideoId, { status: 'processing' });

  const tempDir = await deps.makeTempDir();

  try {
    const property = await deps.fetchProperty(propertyId);
    const images = await deps.fetchOrderedImages(propertyId);

    const imagePaths = images.map((_, index) => path.join(tempDir, `image-${index}.jpg`));
    for (let i = 0; i < images.length; i++) {
      await deps.downloadImage(images[i].image_url, imagePaths[i]);
    }

    const outPath = path.join(tempDir, 'output.mp4');
    const config = buildEditlyConfig({ outPath, width, height, images, imagePaths, property });

    await deps.runEditly(config);

    const outputUrl = await deps.uploadVideo(outPath, propertyVideoId);

    await deps.updateVideoStatus(propertyVideoId, {
      status: 'done',
      output_url: outputUrl,
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    await deps.updateVideoStatus(propertyVideoId, {
      status: 'failed',
      error_message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    await deps.removeTempDir(tempDir);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run apps/worker/src/renderJob.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/renderJob.ts apps/worker/src/renderJob.test.ts
git commit -m "feat(worker): orchestrate render job with status transitions and cleanup"
```

---

### Task 8: `apps/worker` — real dependency wiring and entrypoint

**Files:**
- Create: `apps/worker/src/supabaseDeps.ts`
- Create: `apps/worker/src/index.ts`

**Interfaces:**
- Consumes: `RenderJobDeps` from Task 7, `getRenderQueue`/`getRedisConnection`/`RENDER_QUEUE_NAME` from Task 5, `RenderJobPayload` from `@realestatevids/shared`.
- Produces: `buildSupabaseDeps(): RenderJobDeps` (real Supabase + fs + editly wiring); a running `Worker` process consuming `render-video` jobs.

- [ ] **Step 1: Implement supabaseDeps.ts**

`apps/worker/src/supabaseDeps.ts`:
```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
// @ts-expect-error -- editly ships no types
import editly from 'editly';
import type { RenderJobDeps } from './renderJob';

const PHOTOS_BUCKET = 'property-photos';
const VIDEOS_BUCKET = 'property-videos';

export function buildSupabaseDeps(): RenderJobDeps {
  const supabase = createClient(
    process.env.SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  );

  return {
    async fetchProperty(propertyId) {
      const { data, error } = await supabase.from('properties').select('*').eq('id', propertyId).single();
      if (error) throw new Error(`fetchProperty failed: ${error.message}`);
      return data;
    },

    async fetchOrderedImages(propertyId) {
      const { data, error } = await supabase
        .from('property_images')
        .select('*')
        .eq('property_id', propertyId)
        .order('display_order', { ascending: true });
      if (error) throw new Error(`fetchOrderedImages failed: ${error.message}`);
      return data ?? [];
    },

    async downloadImage(imageUrl, destPath) {
      const { data, error } = await supabase.storage.from(PHOTOS_BUCKET).download(imageUrl);
      if (error || !data) throw new Error(`downloadImage failed for ${imageUrl}: ${error?.message}`);
      const buffer = Buffer.from(await data.arrayBuffer());
      await fs.writeFile(destPath, buffer);
    },

    async runEditly(config) {
      await editly(config);
    },

    async uploadVideo(localPath, propertyVideoId) {
      const fileBuffer = await fs.readFile(localPath);
      const storagePath = `${propertyVideoId}.mp4`;
      const { error } = await supabase.storage.from(VIDEOS_BUCKET).upload(storagePath, fileBuffer, {
        contentType: 'video/mp4',
        upsert: true,
      });
      if (error) throw new Error(`uploadVideo failed: ${error.message}`);
      return storagePath;
    },

    async updateVideoStatus(propertyVideoId, patch) {
      const { error } = await supabase.from('property_videos').update(patch).eq('id', propertyVideoId);
      if (error) throw new Error(`updateVideoStatus failed: ${error.message}`);
    },

    async makeTempDir() {
      return fs.mkdtemp(path.join(os.tmpdir(), 'render-'));
    },

    async removeTempDir(dir) {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}
```

- [ ] **Step 2: Implement worker entrypoint**

`apps/worker/src/index.ts`:
```ts
import { Worker } from 'bullmq';
import type { RenderJobPayload } from '@realestatevids/shared';
import { RENDER_QUEUE_NAME, getRedisConnection } from './queue';
import { renderJob } from './renderJob';
import { buildSupabaseDeps } from './supabaseDeps';

const deps = buildSupabaseDeps();

const worker = new Worker<RenderJobPayload>(
  RENDER_QUEUE_NAME,
  async (job) => {
    await renderJob(job.data, deps);
  },
  {
    connection: getRedisConnection(),
    concurrency: 1,
  }
);

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} threw before renderJob could catch it:`, err);
});

worker.on('completed', (job) => {
  console.log(`Job ${job.id} finished (see property_videos row for actual render outcome).`);
});

console.log('Render worker listening for jobs...');
```

- [ ] **Step 3: Manual smoke check**

```bash
cd apps/worker
cp .env.example .env
# fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
npm run start
```
Expected: console prints `Render worker listening for jobs...` and stays running without throwing.
Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/supabaseDeps.ts apps/worker/src/index.ts
git commit -m "feat(worker): wire real supabase/editly deps and start worker process"
```

---

### Task 9: `apps/web` scaffold + Supabase clients

**Files:**
- Create: `apps/web` (via `create-next-app`)
- Modify: `apps/web/package.json`
- Create: `apps/web/next.config.mjs` (or modify generated one)
- Create: `apps/web/.env.local.example`
- Create: `apps/web/src/lib/supabaseServer.ts`
- Create: `apps/web/src/lib/supabaseBrowser.ts`

**Interfaces:**
- Produces: `getSupabaseServerClient()` (service-role key, for API routes), `getSupabaseBrowserClient()` (anon key, for the browser upload flow).

- [ ] **Step 1: Scaffold Next.js app**

```bash
cd "D:/personal/realEstateVids"
npx create-next-app@latest apps/web --ts --app --eslint --tailwind --src-dir --import-alias "@/*" --use-npm --no-turbopack
```
Answer any interactive prompts with defaults if prompted.

- [ ] **Step 2: Register workspace dependency on shared package**

Edit `apps/web/package.json`, add to `dependencies`:
```json
"@realestatevids/shared": "*",
"@supabase/supabase-js": "^2.45.4"
```

- [ ] **Step 3: Enable transpilation of the shared workspace package**

`apps/web/next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@realestatevids/shared'],
};

export default nextConfig;
```

- [ ] **Step 4: Add env example**

`apps/web/.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 5: Implement server-side Supabase client**

`apps/web/src/lib/supabaseServer.ts`:
```ts
import { createClient } from '@supabase/supabase-js';

export function getSupabaseServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  );
}
```

- [ ] **Step 6: Implement browser-side Supabase client**

`apps/web/src/lib/supabaseBrowser.ts`:
```ts
'use client';

import { createClient } from '@supabase/supabase-js';

export function getSupabaseBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  );
}
```

- [ ] **Step 7: Install and verify dev server boots**

```bash
cd "D:/personal/realEstateVids"
npm install
cp apps/web/.env.local.example apps/web/.env.local
# fill in NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
npm run dev --workspace apps/web
```
Expected: `Local: http://localhost:3000` printed, no build errors. Stop with Ctrl+C.

- [ ] **Step 8: Commit**

```bash
git add apps/web package.json package-lock.json
git commit -m "feat(web): scaffold next.js app with supabase clients"
```

---

### Task 10: `apps/web` — generate endpoint

**Files:**
- Create: `apps/web/src/app/api/properties/[id]/generate/route.ts`
- Create: `apps/web/src/lib/renderQueue.ts`
- Test: `apps/web/src/app/api/properties/[id]/generate/route.test.ts`

**Interfaces:**
- Consumes: `RenderJobPayload`, `VideoVariant` from `@realestatevids/shared`.
- Produces: `enqueueRenderJob(payload: RenderJobPayload): Promise<void>`; `POST /api/properties/:id/generate` accepting `{ landscape: boolean }`, returning `{ videos: PropertyVideo[] }`.

- [ ] **Step 1: Implement renderQueue.ts (web-side enqueue helper)**

`apps/web/src/lib/renderQueue.ts`:
```ts
import { Queue } from 'bullmq';
import type { RenderJobPayload } from '@realestatevids/shared';

const RENDER_QUEUE_NAME = 'render-video';

let queue: Queue<RenderJobPayload> | undefined;

function getQueue(): Queue<RenderJobPayload> {
  if (!queue) {
    queue = new Queue<RenderJobPayload>(RENDER_QUEUE_NAME, {
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    });
  }
  return queue;
}

export async function enqueueRenderJob(payload: RenderJobPayload): Promise<void> {
  await getQueue().add('render', payload);
}
```

- [ ] **Step 2: Write failing test for the route's core logic**

`apps/web/src/app/api/properties/[id]/generate/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSingle = vi.fn();
const mockInsertSelect = vi.fn(() => ({ single: mockSingle }));
const mockInsert = vi.fn(() => ({ select: mockInsertSelect }));
const mockEqCount = vi.fn();
const mockSelectCount = vi.fn(() => ({ eq: mockEqCount }));
const mockFrom = vi.fn((table: string) => {
  if (table === 'property_images') {
    return { select: mockSelectCount };
  }
  return { insert: mockInsert };
});

vi.mock('@/lib/supabaseServer', () => ({
  getSupabaseServerClient: () => ({ from: mockFrom }),
}));

const mockEnqueue = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/renderQueue', () => ({
  enqueueRenderJob: mockEnqueue,
}));

import { POST } from './route';

describe('POST /api/properties/:id/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEqCount.mockResolvedValue({ count: 3, error: null });
    mockSingle.mockImplementation(async () => ({
      data: { id: 'video-1', property_id: 'p1', variant: 'vertical', status: 'queued' },
      error: null,
    }));
  });

  it('creates one queued row and one job for vertical-only requests', async () => {
    const req = new Request('http://localhost/api/properties/p1/generate', {
      method: 'POST',
      body: JSON.stringify({ landscape: false }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'p1' }) });
    const body = await res.json();

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ propertyId: 'p1', width: 1080, height: 1920 })
    );
    expect(body.videos).toHaveLength(1);
  });

  it('creates two rows and two jobs when landscape is requested', async () => {
    const req = new Request('http://localhost/api/properties/p1/generate', {
      method: 'POST',
      body: JSON.stringify({ landscape: true }),
    });

    await POST(req, { params: Promise.resolve({ id: 'p1' }) });

    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
  });

  it('returns 400 when the property has no images', async () => {
    mockEqCount.mockResolvedValue({ count: 0, error: null });

    const req = new Request('http://localhost/api/properties/p1/generate', {
      method: 'POST',
      body: JSON.stringify({ landscape: false }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'p1' }) });

    expect(res.status).toBe(400);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run apps/web/src/app/api/properties/[id]/generate/route.test.ts
```
Expected: FAIL — `./route` module not found.

- [ ] **Step 4: Implement the route**

`apps/web/src/app/api/properties/[id]/generate/route.ts`:
```ts
import { NextResponse } from 'next/server';
import type { RenderJobPayload, VideoVariant } from '@realestatevids/shared';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { enqueueRenderJob } from '@/lib/renderQueue';

const DIMENSIONS: Record<VideoVariant, { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  landscape: { width: 1920, height: 1080 },
};

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const propertyId = params.id;
  const body = await request.json().catch(() => ({}));
  const wantsLandscape = Boolean(body.landscape);

  const supabase = getSupabaseServerClient();

  const { count, error: countError } = await supabase
    .from('property_images')
    .select('*', { count: 'exact', head: true })
    .eq('property_id', propertyId);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }
  if (!count || count < 1) {
    return NextResponse.json({ error: 'Property has no images to render' }, { status: 400 });
  }

  const variants: VideoVariant[] = wantsLandscape ? ['vertical', 'landscape'] : ['vertical'];
  const videos = [];

  for (const variant of variants) {
    const { data, error } = await supabase
      .from('property_videos')
      .insert({ property_id: propertyId, variant, status: 'queued' })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    videos.push(data);

    const payload: RenderJobPayload = {
      propertyVideoId: data.id,
      propertyId,
      ...DIMENSIONS[variant],
    };
    await enqueueRenderJob(payload);
  }

  return NextResponse.json({ videos });
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run apps/web/src/app/api/properties/[id]/generate/route.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/properties/[id]/generate apps/web/src/lib/renderQueue.ts
git commit -m "feat(web): add generate endpoint enqueuing per-variant render jobs"
```

---

### Task 11: `apps/web` — upload and tagging UI

**Files:**
- Create: `apps/web/src/app/properties/[id]/page.tsx`
- Create: `apps/web/src/components/ImageUploader.tsx`
- Create: `apps/web/src/components/ImageList.tsx`
- Create: `apps/web/src/components/RuntimeEstimate.tsx`

**Interfaces:**
- Consumes: `PropertyImage`, `estimateTotalRuntime` from `@realestatevids/shared`; `getSupabaseBrowserClient` from Task 9.
- Produces: a property page rendering upload + reorder/tag/delete + runtime estimate, wired to Supabase Storage and `property_images` table directly from the browser.

- [ ] **Step 1: Implement RuntimeEstimate (pure display component, easiest to verify first)**

`apps/web/src/components/RuntimeEstimate.tsx`:
```tsx
'use client';

import { estimateTotalRuntime } from '@realestatevids/shared';

const WARNING_THRESHOLD_SECONDS = 55;

export function RuntimeEstimate({ numPhotos }: { numPhotos: number }) {
  if (numPhotos < 1) {
    return null;
  }
  const seconds = Math.round(estimateTotalRuntime(numPhotos));
  const isLong = seconds > WARNING_THRESHOLD_SECONDS;

  return (
    <p className={isLong ? 'text-red-600' : 'text-gray-600'}>
      Estimated video length: {seconds}s
      {isLong ? ' — this is longer than the recommended 45-60s for social.' : ''}
    </p>
  );
}
```

- [ ] **Step 2: Implement ImageUploader**

`apps/web/src/components/ImageUploader.tsx`:
```tsx
'use client';

import { useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

export function ImageUploader({
  propertyId,
  nextDisplayOrder,
  onUploaded,
}: {
  propertyId: string;
  nextDisplayOrder: number;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(files: FileList) {
    setUploading(true);
    const supabase = getSupabaseBrowserClient();
    let order = nextDisplayOrder;

    for (const file of Array.from(files)) {
      const path = `${propertyId}/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from('property-photos').upload(path, file);
      if (uploadError) {
        console.error('Upload failed', uploadError);
        continue;
      }
      const { error: insertError } = await supabase.from('property_images').insert({
        property_id: propertyId,
        image_url: path,
        room_type: 'bedroom',
        display_order: order,
      });
      if (insertError) {
        console.error('Insert failed', insertError);
      }
      order += 1;
    }

    setUploading(false);
    onUploaded();
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*"
        disabled={uploading}
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      {uploading ? <p>Uploading...</p> : null}
    </div>
  );
}
```

- [ ] **Step 3: Implement ImageList (tag edit, delete, drag reorder)**

`apps/web/src/components/ImageList.tsx`:
```tsx
'use client';

import { useState } from 'react';
import type { PropertyImage } from '@realestatevids/shared';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

const ROOM_PRESETS = ['bedroom', 'kitchen', 'living room', 'bathroom', 'exterior', 'balcony', 'dining room'];

export function ImageList({
  images,
  onChanged,
}: {
  images: PropertyImage[];
  onChanged: () => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);

  async function updateRoomType(id: string, roomType: string) {
    const supabase = getSupabaseBrowserClient();
    await supabase.from('property_images').update({ room_type: roomType }).eq('id', id);
    onChanged();
  }

  async function deleteImage(id: string) {
    const supabase = getSupabaseBrowserClient();
    await supabase.from('property_images').delete().eq('id', id);
    onChanged();
  }

  async function reorder(draggedId: string, targetId: string) {
    const ids = images.map((img) => img.id);
    const fromIndex = ids.indexOf(draggedId);
    const toIndex = ids.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

    const reordered = [...images];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    const supabase = getSupabaseBrowserClient();
    await Promise.all(
      reordered.map((img, index) =>
        supabase.from('property_images').update({ display_order: index }).eq('id', img.id)
      )
    );
    onChanged();
  }

  return (
    <ul>
      {images.map((image) => (
        <li
          key={image.id}
          draggable
          onDragStart={() => setDraggingId(image.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => draggingId && reorder(draggingId, image.id)}
        >
          <input
            list="room-presets"
            defaultValue={image.room_type}
            onBlur={(e) => updateRoomType(image.id, e.target.value)}
          />
          <button onClick={() => deleteImage(image.id)}>Delete</button>
        </li>
      ))}
      <datalist id="room-presets">
        {ROOM_PRESETS.map((preset) => (
          <option key={preset} value={preset} />
        ))}
      </datalist>
    </ul>
  );
}
```

- [ ] **Step 4: Implement the property page wiring it together**

`apps/web/src/app/properties/[id]/page.tsx`:
```tsx
'use client';

import { use, useCallback, useEffect, useState } from 'react';
import type { PropertyImage } from '@realestatevids/shared';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { ImageUploader } from '@/components/ImageUploader';
import { ImageList } from '@/components/ImageList';
import { RuntimeEstimate } from '@/components/RuntimeEstimate';

export default function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: propertyId } = use(params);
  const [images, setImages] = useState<PropertyImage[]>([]);
  const [landscape, setLandscape] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadImages = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from('property_images')
      .select('*')
      .eq('property_id', propertyId)
      .order('display_order', { ascending: true });
    setImages(data ?? []);
  }, [propertyId]);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  async function handleGenerate() {
    setGenerating(true);
    await fetch(`/api/properties/${propertyId}/generate`, {
      method: 'POST',
      body: JSON.stringify({ landscape }),
    });
    setGenerating(false);
  }

  return (
    <main>
      <h1>Property photos</h1>
      <ImageUploader propertyId={propertyId} nextDisplayOrder={images.length} onUploaded={loadImages} />
      <ImageList images={images} onChanged={loadImages} />
      <RuntimeEstimate numPhotos={images.length} />
      <label>
        <input type="checkbox" checked={landscape} onChange={(e) => setLandscape(e.target.checked)} />
        Also generate landscape version
      </label>
      <button disabled={generating || images.length === 0} onClick={handleGenerate}>
        Generate Video
      </button>
    </main>
  );
}
```

- [ ] **Step 5: Manual browser check**

```bash
npm run dev --workspace apps/web
```
Open `http://localhost:3000/properties/<an-existing-property-id>` (create one row in the
`properties` table via Supabase Studio first). Upload 2-3 photos, confirm they appear,
retag one, drag to reorder, delete one, confirm runtime estimate text updates.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/properties apps/web/src/components
git commit -m "feat(web): add upload, tagging, reorder ui with runtime estimate"
```

---

### Task 12: `apps/web` — video status display

**Files:**
- Create: `apps/web/src/components/VideoStatusList.tsx`
- Modify: `apps/web/src/app/properties/[id]/page.tsx`

**Interfaces:**
- Consumes: `PropertyVideo` from `@realestatevids/shared`; `getSupabaseBrowserClient` from Task 9.
- Produces: a component that subscribes to `property_videos` rows for a property via Supabase Realtime (polling fallback) and renders per-variant status, preview, download link, retry button.

- [ ] **Step 1: Implement VideoStatusList**

`apps/web/src/components/VideoStatusList.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import type { PropertyVideo } from '@realestatevids/shared';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

export function VideoStatusList({ propertyId }: { propertyId: string }) {
  const [videos, setVideos] = useState<PropertyVideo[]>([]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    async function load() {
      const { data } = await supabase
        .from('property_videos')
        .select('*')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false });
      setVideos(data ?? []);
    }

    load();

    const channel = supabase
      .channel(`property_videos:${propertyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'property_videos', filter: `property_id=eq.${propertyId}` },
        load
      )
      .subscribe();

    const pollId = setInterval(load, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollId);
    };
  }, [propertyId]);

  async function retry(video: PropertyVideo) {
    await fetch(`/api/properties/${propertyId}/generate`, {
      method: 'POST',
      body: JSON.stringify({ landscape: video.variant === 'landscape' }),
    });
  }

  if (videos.length === 0) {
    return null;
  }

  return (
    <ul>
      {videos.map((video) => (
        <li key={video.id}>
          <strong>{video.variant}</strong>: {video.status}
          {video.status === 'done' && video.output_url ? (
            <>
              <video controls width={240} src={`/api/videos/${video.id}/stream`} />
              <a href={`/api/videos/${video.id}/stream`} download>
                Download
              </a>
            </>
          ) : null}
          {video.status === 'failed' ? (
            <>
              <span>{video.error_message}</span>
              <button onClick={() => retry(video)}>Retry</button>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
```

Note: this references a `/api/videos/[id]/stream` route for signed playback/download,
since `property-videos` is a private bucket. That route is out of scope for this task
list's automated tests (it is a thin proxy) — add it now as a small supporting route:

`apps/web/src/app/api/videos/[id]/stream/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  const { data: video, error } = await supabase
    .from('property_videos')
    .select('output_url')
    .eq('id', id)
    .single();

  if (error || !video?.output_url) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from('property-videos')
    .createSignedUrl(video.output_url, 60 * 10);

  if (signError || !signed) {
    return NextResponse.json({ error: signError?.message ?? 'Could not sign url' }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
```

- [ ] **Step 2: Wire into the property page**

Edit `apps/web/src/app/properties/[id]/page.tsx`, add the import and render it below
the Generate Video button:
```tsx
import { VideoStatusList } from '@/components/VideoStatusList';
```
```tsx
      <button disabled={generating || images.length === 0} onClick={handleGenerate}>
        Generate Video
      </button>
      <VideoStatusList propertyId={propertyId} />
```

- [ ] **Step 3: Manual end-to-end check**

With `docker compose up -d` (Redis), `npm run start --workspace apps/worker` (worker),
and `npm run dev --workspace apps/web` (web) all running:
1. Upload a few photos, tag them, click Generate Video.
2. Confirm a `queued` chip appears, then `processing`, then `done`.
3. Confirm the inline video preview plays and shows Ken Burns zoom alternating
   in/out, correct captions, and a black outro card with contact details.
4. Confirm the download link saves a playable mp4.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/VideoStatusList.tsx apps/web/src/app/api/videos apps/web/src/app/properties/[id]/page.tsx
git commit -m "feat(web): show per-variant render status with preview, download, retry"
```

---

## Post-plan notes

- Editly requires a working ffmpeg on the machine running `apps/worker` (its
  `ffmpeg-static` optional dependency usually covers this, but verify `npx editly --help`
  runs cleanly after `npm install` before relying on Task 8's manual smoke check).
- No automated integration test renders a real mp4 through Editly in this plan — Task
  6/7 tests cover the config-building and orchestration logic without invoking ffmpeg,
  which keeps the test suite fast and deterministic. If a true end-to-end render test
  is wanted later, add it as a separate opt-in task once the manual check in Task 12
  Step 3 has been run at least once successfully.
