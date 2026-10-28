/**
 * Lane cloth colors. Saddle, jockey silks, lane markers, and ranking chips
 * read this list. Lane 1 is index 0.
 * The HUD caption border #5CE1FF is not a lane color.
 * Number ink is black on lanes 3, 10, and 12. Every other number is white.
 */
export const LANE_COLORS = [
  "#E5173F",
  "#1F5BFF",
  "#FFD000",
  "#00A86B",
  "#A63BE6",
  "#FF4FC8",
  "#0F7F8C",
  "#14181F",
  "#FF7A1A",
  "#F2F0E8",
  "#8A5530",
  "#A6E22E",
] as const;

const BLACK_NUMBER_LANES = new Set([3, 10, 12]);

export function laneNumberInk(laneNumber: number): { color: string; stroke: string } {
  const lane = Math.max(1, Math.floor(laneNumber));
  if (BLACK_NUMBER_LANES.has(lane)) return { color: "#14181F", stroke: "#F7F4EA" };
  return { color: "#FFFFFF", stroke: "#140E0A" };
}

export function laneColor(laneNumber: number): string {
  const index = (Math.max(1, Math.floor(laneNumber)) - 1) % LANE_COLORS.length;
  return LANE_COLORS[index] ?? LANE_COLORS[0];
}

export function laneColorValue(laneNumber: number): number {
  return Number.parseInt(laneColor(laneNumber).slice(1), 16);
}

/** Recolor the red jacket and saddle cloth on the base silk sheet. */
export function recolorRacingSilks(image: CanvasImageSource, laneNumber: number, target: HTMLCanvasElement) {
  const ctx = target.getContext("2d");
  if (!ctx) return;
  const width = target.width;
  const height = target.height;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const hex = laneColorValue(laneNumber);
  const lr = (hex >> 16) & 255;
  const lg = (hex >> 8) & 255;
  const lb = hex & 255;
  const darkCloth = lr + lg + lb < 90;
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    const a = pixels[i + 3] ?? 0;
    if (a < 16) continue;
    if (r > 70 && g < r * 0.62 && b < r * 0.62 && r - g > 35) {
      const shade = Math.max(darkCloth ? 0.62 : 0, r / 188);
      pixels[i] = clampByte(lr * shade);
      pixels[i + 1] = clampByte(lg * shade);
      pixels[i + 2] = clampByte(lb * shade);
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
