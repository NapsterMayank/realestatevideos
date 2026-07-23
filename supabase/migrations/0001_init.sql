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
