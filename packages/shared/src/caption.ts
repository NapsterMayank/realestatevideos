export function formatRoomCaption(roomType: string): string {
  if (!roomType) {
    return '';
  }
  return roomType.charAt(0).toUpperCase() + roomType.slice(1);
}
