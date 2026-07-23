import {
  calcPerPhotoDuration,
  resolveZoomDirection,
  formatRoomCaption,
  type Property,
  type PropertyImage,
} from '@realestatevids/shared';

export interface BuildEditlyConfigParams {
  outPath: string;
  width: number;
  height: number;
  images: PropertyImage[];
  imagePaths: string[];
  property: Property;
}

export interface EditlyLayer {
  type: string;
  [key: string]: unknown;
}

export interface EditlyClip {
  duration: number;
  transition?: { name: string };
  layers: EditlyLayer[];
}

export interface EditlyConfig {
  outPath: string;
  width: number;
  height: number;
  clips: EditlyClip[];
}

export function buildEditlyConfig({
  outPath,
  width,
  height,
  images,
  imagePaths,
  property,
}: BuildEditlyConfigParams): EditlyConfig {
  const perPhotoDuration = calcPerPhotoDuration(images.length);

  const clips: EditlyClip[] = images.map((image, index) => ({
    duration: perPhotoDuration,
    transition: { name: 'fade' },
    layers: [
      {
        type: 'image',
        path: imagePaths[index],
        zoomDirection: resolveZoomDirection(index, image.zoom_direction),
      },
      {
        type: 'title',
        text: formatRoomCaption(image.room_type),
        position: 'bottom',
      },
    ],
  }));

  const contactLines = [property.agency_name, `Contact us: ${property.contact_phone}`, property.contact_website]
    .filter((line): line is string => Boolean(line))
    .join('\n');

  const outroClip: EditlyClip = {
    duration: 5,
    layers: [
      { type: 'fill-color', color: '#000000' },
      { type: 'title', text: contactLines, position: 'center' },
    ],
  };

  return { outPath, width, height, clips: [...clips, outroClip] };
}
