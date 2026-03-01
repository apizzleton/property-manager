export type AssetCondition = "new" | "good" | "fair" | "poor" | "needs_replacement";
export type AssetEventType =
  | "install"
  | "inspect"
  | "repair"
  | "replace"
  | "paint"
  | "flooring_update"
  | "other";

export const ASSET_CONDITIONS: AssetCondition[] = ["new", "good", "fair", "poor", "needs_replacement"];
export const ASSET_EVENT_TYPES: AssetEventType[] = [
  "install",
  "inspect",
  "repair",
  "replace",
  "paint",
  "flooring_update",
  "other",
];

/**
 * Keep asset condition values within the supported enum set.
 */
export function normalizeAssetCondition(value: unknown): AssetCondition {
  return typeof value === "string" && ASSET_CONDITIONS.includes(value as AssetCondition)
    ? (value as AssetCondition)
    : "good";
}

/**
 * Convert category values to a canonical form for reliable filtering.
 */
export function normalizeAssetCategory(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Sort event-like records newest-first by date while tolerating invalid values.
 */
export function sortAssetEventsNewestFirst<T extends { eventDate: string | Date }>(events: T[]): T[] {
  return [...events].sort((a, b) => {
    const aMs = new Date(a.eventDate).getTime();
    const bMs = new Date(b.eventDate).getTime();
    if (Number.isNaN(aMs) && Number.isNaN(bMs)) return 0;
    if (Number.isNaN(aMs)) return 1;
    if (Number.isNaN(bMs)) return -1;
    return bMs - aMs;
  });
}
