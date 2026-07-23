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
