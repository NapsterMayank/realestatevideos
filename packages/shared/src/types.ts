export type RoomZoomDirection = 'in' | 'out';

export interface Property {
  id: string;
  name: string;
  contact_phone: string;
  contact_website: string | null;
  agency_name: string | null;
  created_at: string;
}

export interface PropertyImage {
  id: string;
  property_id: string;
  image_url: string;
  room_type: string;
  display_order: number;
  zoom_direction: RoomZoomDirection | null;
  created_at: string;
}

export type VideoVariant = 'vertical' | 'landscape';
export type VideoStatus = 'queued' | 'processing' | 'done' | 'failed';

export interface PropertyVideo {
  id: string;
  property_id: string;
  variant: VideoVariant;
  status: VideoStatus;
  output_url: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface RenderJobPayload {
  propertyVideoId: string;
  propertyId: string;
  width: number;
  height: number;
}
