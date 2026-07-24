import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buffer as streamToBuffer } from 'node:stream/consumers';
import type { Readable } from 'node:stream';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getPrismaClient } from '@realestatevids/db';
import type { Property, PropertyImage } from '@realestatevids/shared';
// @ts-expect-error -- editly ships no types
import editly from 'editly';
import type { RenderJobDeps } from './renderJob';
import { buildS3Client } from './storageClient';

const PHOTOS_BUCKET = process.env.MINIO_PHOTOS_BUCKET ?? 'property-photos';
const VIDEOS_BUCKET = process.env.MINIO_VIDEOS_BUCKET ?? 'property-videos';

export function buildDbDeps(): RenderJobDeps {
  const prisma = getPrismaClient();
  const s3 = buildS3Client();

  return {
    async fetchProperty(propertyId): Promise<Property> {
      try {
        const property = await prisma.property.findUniqueOrThrow({ where: { id: propertyId } });
        return {
          id: property.id,
          name: property.name,
          contact_phone: property.contactPhone,
          contact_website: property.contactWebsite,
          agency_name: property.agencyName,
          created_at: property.createdAt.toISOString(),
        };
      } catch (err) {
        throw new Error(`fetchProperty failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    async fetchOrderedImages(propertyId): Promise<PropertyImage[]> {
      try {
        const images = await prisma.propertyImage.findMany({
          where: { propertyId },
          orderBy: { displayOrder: 'asc' },
        });
        return images.map((image) => ({
          id: image.id,
          property_id: image.propertyId,
          image_url: image.imageUrl,
          room_type: image.roomType,
          display_order: image.displayOrder,
          zoom_direction: image.zoomDirection as PropertyImage['zoom_direction'],
          created_at: image.createdAt.toISOString(),
        }));
      } catch (err) {
        throw new Error(`fetchOrderedImages failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    async downloadImage(imageUrl, destPath) {
      try {
        const result = await s3.send(
          new GetObjectCommand({ Bucket: PHOTOS_BUCKET, Key: imageUrl })
        );
        if (!result.Body) throw new Error('empty response body');
        const buffer = await streamToBuffer(result.Body as Readable);
        await fs.writeFile(destPath, buffer);
      } catch (err) {
        throw new Error(
          `downloadImage failed for ${imageUrl}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    },

    async runEditly(config) {
      await editly(config);
    },

    async uploadVideo(localPath, propertyVideoId) {
      try {
        const fileBuffer = await fs.readFile(localPath);
        const storagePath = `${propertyVideoId}.mp4`;
        await s3.send(
          new PutObjectCommand({
            Bucket: VIDEOS_BUCKET,
            Key: storagePath,
            Body: fileBuffer,
            ContentType: 'video/mp4',
          })
        );
        return storagePath;
      } catch (err) {
        throw new Error(`uploadVideo failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    async updateVideoStatus(propertyVideoId, patch) {
      try {
        const data: {
          status?: string;
          outputUrl?: string;
          errorMessage?: string;
          completedAt?: Date;
        } = {};
        if (patch.status !== undefined) data.status = patch.status;
        if (patch.output_url !== undefined && patch.output_url !== null) data.outputUrl = patch.output_url;
        if (patch.error_message !== undefined && patch.error_message !== null)
          data.errorMessage = patch.error_message;
        if (patch.completed_at !== undefined && patch.completed_at !== null)
          data.completedAt = new Date(patch.completed_at);

        await prisma.propertyVideo.update({ where: { id: propertyVideoId }, data });
      } catch (err) {
        throw new Error(`updateVideoStatus failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    async makeTempDir() {
      return fs.mkdtemp(path.join(os.tmpdir(), 'render-'));
    },

    async removeTempDir(dir) {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}
