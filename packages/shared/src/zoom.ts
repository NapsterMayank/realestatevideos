import type { RoomZoomDirection } from './types';

export function resolveZoomDirection(
  index: number,
  override: RoomZoomDirection | null | undefined
): RoomZoomDirection {
  if (override === 'in' || override === 'out') {
    return override;
  }
  return index % 2 === 0 ? 'in' : 'out';
}
