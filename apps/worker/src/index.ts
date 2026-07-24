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
