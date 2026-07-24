-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "contact_website" TEXT NOT NULL,
    "agency_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_images" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "room_type" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "zoom_direction" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_videos" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "output_url" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "property_videos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_images_property_id_idx" ON "property_images"("property_id");

-- CreateIndex
CREATE INDEX "property_videos_property_id_idx" ON "property_videos"("property_id");

-- AddForeignKey
ALTER TABLE "property_images" ADD CONSTRAINT "property_images_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_videos" ADD CONSTRAINT "property_videos_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraint
ALTER TABLE property_images ADD CONSTRAINT property_images_zoom_direction_check CHECK (zoom_direction IN ('in', 'out'));
ALTER TABLE property_videos ADD CONSTRAINT property_videos_variant_check CHECK (variant IN ('vertical', 'landscape'));
ALTER TABLE property_videos ADD CONSTRAINT property_videos_status_check CHECK (status IN ('queued', 'processing', 'done', 'failed'));
