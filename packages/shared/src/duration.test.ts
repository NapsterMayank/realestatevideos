import { describe, it, expect } from 'vitest';
import { calcPerPhotoDuration, estimateTotalRuntime } from './duration';

describe('calcPerPhotoDuration', () => {
  it('returns max 3s when few photos', () => {
    expect(calcPerPhotoDuration(1)).toBe(3);
    expect(calcPerPhotoDuration(16)).toBeCloseTo(3.125 > 3 ? 3 : 50 / 16);
  });

  it('scales down for many photos but floors at 1.5s', () => {
    expect(calcPerPhotoDuration(40)).toBe(1.5);
  });

  it('throws for zero or negative photo counts', () => {
    expect(() => calcPerPhotoDuration(0)).toThrow();
    expect(() => calcPerPhotoDuration(-1)).toThrow();
  });
});

describe('estimateTotalRuntime', () => {
  it('adds the 5s outro to photo runtime', () => {
    expect(estimateTotalRuntime(10)).toBe(10 * calcPerPhotoDuration(10) + 5);
  });
});
