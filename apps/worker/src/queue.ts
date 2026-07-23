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
