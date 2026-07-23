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
