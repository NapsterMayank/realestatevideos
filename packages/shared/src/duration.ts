const OUTRO_SECONDS = 5;
const PHOTO_BUDGET_SECONDS = 50;
const MIN_PHOTO_DURATION = 1.5;
const MAX_PHOTO_DURATION = 3;

export function calcPerPhotoDuration(numPhotos: number): number {
  if (numPhotos <= 0) {
    throw new Error('numPhotos must be greater than 0');
  }
  const raw = PHOTO_BUDGET_SECONDS / numPhotos;
  return Math.min(MAX_PHOTO_DURATION, Math.max(MIN_PHOTO_DURATION, raw));
}

export function estimateTotalRuntime(numPhotos: number): number {
  return numPhotos * calcPerPhotoDuration(numPhotos) + OUTRO_SECONDS;
}
