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
