/**
 * Rank-slot contents. Phase 1 has no portraits: `name` draws the horse name
 * where the face would sit. `face` keeps the portrait path for later.
 * The entry form that would edit those names is out of scope.
 */
export type RankSlotMode = "face" | "name";

export const rankDisplayConfig = {
  mode: "name" as RankSlotMode,
};

export function rankSlotModeFromSearch(search: string): RankSlotMode {
  const value = new URLSearchParams(search).get("hud");
  if (value === "face" || value === "name") return value;
  return rankDisplayConfig.mode;
}
