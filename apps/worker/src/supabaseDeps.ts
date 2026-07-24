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
