import { describe, it, expect } from 'vitest';
import { resolveZoomDirection } from './zoom';

describe('resolveZoomDirection', () => {
  it('alternates starting with in at index 0', () => {
    expect(resolveZoomDirection(0, null)).toBe('in');
    expect(resolveZoomDirection(1, null)).toBe('out');
    expect(resolveZoomDirection(2, null)).toBe('in');
    expect(resolveZoomDirection(3, undefined)).toBe('out');
  });

  it('manual override always wins', () => {
    expect(resolveZoomDirection(0, 'out')).toBe('out');
    expect(resolveZoomDirection(1, 'in')).toBe('in');
  });
});
