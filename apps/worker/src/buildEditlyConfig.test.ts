import { describe, it, expect } from 'vitest';
import { buildEditlyConfig } from './buildEditlyConfig';
import type { Property, PropertyImage } from '@realestatevids/shared';

const property: Property = {
  id: 'p1',
  name: '123 Main St',
  contact_phone: '+91 9999999999',
  contact_website: 'www.example.com',
  agency_name: 'Acme Realty',
  created_at: '2026-01-01T00:00:00Z',
};

function makeImage(overrides: Partial<PropertyImage>): PropertyImage {
  return {
    id: overrides.id ?? 'img1',
    property_id: 'p1',
    image_url: 'irrelevant',
    room_type: 'bedroom',
    display_order: 0,
    zoom_direction: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('buildEditlyConfig', () => {
  it('builds one clip per image plus a fixed outro clip', () => {
    const images = [
      makeImage({ id: 'a', room_type: 'bedroom', display_order: 0 }),
      makeImage({ id: 'b', room_type: 'kitchen', display_order: 1 }),
    ];
    const config = buildEditlyConfig({
      outPath: './out.mp4',
      width: 1080,
      height: 1920,
      images,
      imagePaths: ['/tmp/a.jpg', '/tmp/b.jpg'],
      property,
    });

    expect(config.outPath).toBe('./out.mp4');
    expect(config.width).toBe(1080);
    expect(config.height).toBe(1920);
    expect(config.clips).toHaveLength(3);

    const [clip1, clip2, outro] = config.clips;

    expect(clip1.layers[0]).toMatchObject({ type: 'image', path: '/tmp/a.jpg', zoomDirection: 'in' });
    expect(clip1.layers[1]).toMatchObject({ type: 'title', text: 'Bedroom', position: 'bottom' });
    expect(clip1.transition).toEqual({ name: 'fade' });

    expect(clip2.layers[0]).toMatchObject({ type: 'image', path: '/tmp/b.jpg', zoomDirection: 'out' });
    expect(clip2.layers[1]).toMatchObject({ type: 'title', text: 'Kitchen', position: 'bottom' });

    expect(outro.duration).toBe(5);
    expect(outro.layers[0]).toMatchObject({ type: 'fill-color', color: '#000000' });
    expect(outro.layers[1]).toMatchObject({
      type: 'title',
      text: 'Acme Realty\nContact us: +91 9999999999\nwww.example.com',
      position: 'center',
    });
  });

  it('respects manual zoom_direction override', () => {
    const images = [makeImage({ id: 'a', zoom_direction: 'out', display_order: 0 })];
    const config = buildEditlyConfig({
      outPath: './out.mp4',
      width: 1080,
      height: 1920,
      images,
      imagePaths: ['/tmp/a.jpg'],
      property,
    });
    expect(config.clips[0].layers[0]).toMatchObject({ zoomDirection: 'out' });
  });

  it('omits agency_name line when not set', () => {
    const images = [makeImage({ id: 'a', display_order: 0 })];
    const config = buildEditlyConfig({
      outPath: './out.mp4',
      width: 1080,
      height: 1920,
      images,
      imagePaths: ['/tmp/a.jpg'],
      property: { ...property, agency_name: null },
    });
    const outro = config.clips[config.clips.length - 1];
    expect(outro.layers[1]).toMatchObject({
      text: 'Contact us: +91 9999999999\nwww.example.com',
    });
  });
});
