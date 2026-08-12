export const DAILY_WATER_XP_INCREMENT = 10;
export const MAX_WATER_XP = 500;
export const REVIVAL_COST_XP = 1000;

export function wateringXp(baseXp: number, careDay: number): number {
  const normalizedDay = Math.max(1, Math.floor(careDay));
  const cap = Math.max(baseXp, MAX_WATER_XP);
  return Math.min(cap, baseXp + (normalizedDay - 1) * DAILY_WATER_XP_INCREMENT);
}
