# Real Estate Listing Video Generator — Design

## Goal

Internal slideshow-video tool for a solo agency operator. Upload tagged property
photos, generate a Ken Burns slideshow mp4 (vertical and/or landscape) with
per-photo room captions and a black outro card with contact details. No AI
video generation, no room classification, no simulated walkthroughs.

## Repo layout

```
realEstateVids/
  apps/web/            Next.js app: upload/tagging UI, API routes, status polling
  apps/worker/         BullMQ worker process: fetch job -> render via Editly -> upload mp4
  packages/shared/     Shared TS types, Supabase client, pure helpers (duration calc,
                        zoom alternation, caption formatting)
  docker-compose.yml   Local Redis for BullMQ
  supabase/migrations/ SQL migrations for schema below
```

Both `apps/web` and `apps/worker` depend on `packages/shared` so duration/zoom/caption
logic is defined once and used identically on both sides.

## Data model (Supabase / Postgres)

### `properties`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| name | text | |
| contact_phone | text | |
| contact_website | text | |
| agency_name | text nullable | shown on outro if set |
| created_at | timestamptz | |

### `property_images`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| property_id | uuid fk -> properties.id | |
| image_url | text | Supabase storage path in `property-photos` bucket |
| room_type | text | freeform; UI offers presets but any string allowed |
| display_order | integer | drives render sequence; rewritten on drag reorder |
| zoom_direction | text nullable | "in" \| "out"; manual override, else alternated |
| created_at | timestamptz | |

### `property_videos`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| property_id | uuid fk -> properties.id | |
| variant | text | "vertical" (1080x1920) \| "landscape" (1920x1080) |
| status | text | queued \| processing \| done \| failed |
| output_url | text nullable | mp4 path in `property-videos` bucket, set on done |
| error_message | text nullable | set on failed |
| created_at | timestamptz | |
| completed_at | timestamptz nullable | |

Storage buckets: `property-photos` (originals), `property-videos` (rendered mp4s).

## Upload / tagging UI

- Property page: multi-file dropzone, uploads directly to Supabase Storage via
  signed upload URLs from browser, then inserts `property_images` rows through
  a Next.js API route.
- Each image row shows: thumbnail, room_type control (preset dropdown: bedroom,
  kitchen, living room, bathroom, exterior, balcony, dining room — plus free
  text input for a custom label), drag handle, delete button.
- Drag-reorder rewrites `display_order` for all rows in the list on drop.
- Runtime estimate bar computes `(numPhotos * perPhotoDuration) + 5` using the
  same duration formula the worker uses (see below), colored warning past ~55s.
- "Generate Video" button with a checkbox "Also generate landscape version".
  Submits to `POST /api/properties/:id/generate`.

## Generate endpoint

`POST /api/properties/:id/generate`:
1. Validate property has >= 1 image.
2. Insert one `property_videos` row per requested variant (`vertical` always,
   `landscape` if checkbox checked), status `queued`.
3. Enqueue one BullMQ job per row: `{ propertyVideoId, propertyId, width, height }`
   (`1080x1920` for vertical, `1920x1080` for landscape).
4. Return the created `property_videos` rows so the UI can start watching them.

## Shared logic (`packages/shared`)

**Duration auto-scale** — outro is fixed at 5s, photo budget is 50s (55s target
total):
```
perPhotoDuration = clamp(50 / numPhotos, min = 1.5s, max = 3s)
```
Up to 16 photos get the full 3s each; beyond that, per-photo duration shrinks
down to a 1.5s floor. If a property has enough photos that even the 1.5s floor
pushes total runtime past ~55s, the UI shows the warning but does not block
generation.

**Zoom alternation** — for image at sequence index `i` (0-based):
```
zoomDirection = image.zoom_direction ?? (i % 2 === 0 ? 'in' : 'out')
```
Manual per-row override always wins; otherwise alternates by position in the
final sequence (not by room type), so re-tagging/reordering doesn't clump same
directions together.

**Caption formatting** — capitalize first letter of `room_type`, leave rest
as-is (`"living room"` -> `"Living room"`).

## Worker pipeline (`apps/worker`)

For each BullMQ job:
1. Mark `property_videos.status = 'processing'`.
2. Fetch ordered `property_images` rows for `propertyId`.
3. Download each image into a per-job temp dir (`os.tmpdir()/render-<jobId>/`).
4. Build Editly config:
   - One clip per image: `duration` from the formula above, `transition: {name:'fade'}`,
     image layer with `zoomDirection`, title layer with formatted room_type at
     `position: 'bottom'`, fading in with the clip.
   - Fixed outro clip: 5s, no transition needed for the fade-in effect on the
     *incoming* side since the preceding clip's `transition` already crossfades
     into it; black fill-color layer + centered title layer with agency name
     (if set) and contact phone/website.
   - `width`/`height` set from the job payload (vertical or landscape).
5. Render via Editly's JS API (`editly({...config})`), output to temp dir.
6. Upload resulting mp4 to `property-videos` bucket.
7. Set `status = 'done'`, `output_url`, `completed_at`.
8. On any thrown error: set `status = 'failed'`, `error_message = err.message`.
9. Always delete the temp dir in a `finally` block, success or failure.

## UI status display

Property page subscribes to `property_videos` rows for that property via
Supabase Realtime, falling back to a 3s poll if Realtime is unavailable. Shows
one status chip per variant (queued/processing/done/failed). On `done`, shows
an inline `<video>` preview and a download link. On `failed`, shows the error
message and a retry button that re-enqueues the same variant.

## Error handling

- Worker errors are caught per-job; BullMQ's own retry is disabled (one
  attempt) since render failures are usually deterministic (bad image, ffmpeg
  crash) — retrying won't help without a code/data fix. The UI retry button
  lets the user explicitly re-trigger after fixing the underlying issue.
- Missing/unreadable image download aborts that job with a clear error message
  naming the offending image.

## Testing

- **Unit** (`packages/shared`): duration formula across photo counts (1, 16,
  17, 40), zoom alternation with and without manual overrides, caption
  capitalization edge cases (empty string, already-capitalized, multi-word).
- **Worker integration**: render a short config (2-3 tiny fixture images,
  1s/photo) through the real Editly pipeline, assert output mp4 exists and its
  duration (via ffprobe) matches the expected sum of clip durations.
- **Web**: API route test for `/generate` — asserts correct number of
  `property_videos` rows and BullMQ jobs created per variant selection, using a
  mocked Supabase client and mocked queue.

## Out of scope (unchanged from spec)

No AI-generated video motion, no automatic room classification, no simulated
multi-room walkthrough/camera transitions.
