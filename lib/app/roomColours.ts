export const ROOM_COLOURS = {
  slate: "#64748b",
  blue: "#3973c8",
  green: "#32866b",
  purple: "#8362bd",
  orange: "#bc7540",
  pink: "#b65d88",
} as const;

export type RoomColour = keyof typeof ROOM_COLOURS;

export function roomColour(value: string): string {
  return ROOM_COLOURS[value as RoomColour] ?? ROOM_COLOURS.slate;
}
