import { describe, it, expect } from 'vitest';
import { formatRoomCaption } from './caption';

describe('formatRoomCaption', () => {
  it('capitalizes only the first letter', () => {
    expect(formatRoomCaption('bedroom')).toBe('Bedroom');
    expect(formatRoomCaption('living room')).toBe('Living room');
  });

  it('leaves already-capitalized text unchanged', () => {
    expect(formatRoomCaption('Kitchen')).toBe('Kitchen');
  });

  it('returns empty string unchanged', () => {
    expect(formatRoomCaption('')).toBe('');
  });
});
