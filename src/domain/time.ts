const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const INITIAL_SIZE_MM = 10;
export const DAILY_GROWTH_MM = 0.3;

export function jstDate(now: Date): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addCalendarDays(date: string, days: number): string {
  const midnight = Date.parse(`${date}T00:00:00.000Z`);
  return new Date(midnight + days * DAY_MS).toISOString().slice(0, 10);
}

export function startOfJstDate(date: string): Date {
  return new Date(`${date}T00:00:00+09:00`);
}

export function deathDate(lastWateredDate: string): string {
  return addCalendarDays(lastWateredDate, 2);
}

export function deathAt(lastWateredDate: string): Date {
  return startOfJstDate(deathDate(lastWateredDate));
}

export function isDead(lastWateredDate: string, now: Date): boolean {
  return now.getTime() >= deathAt(lastWateredDate).getTime();
}

export function sizeAt(bornAt: Date, at: Date): number {
  const elapsedDays = Math.max(0, at.getTime() - bornAt.getTime()) / DAY_MS;
  return (
    Math.round((INITIAL_SIZE_MM + elapsedDays * DAILY_GROWTH_MM) * 100) / 100
  );
}

export function ageDays(bornAt: Date, at: Date): number {
  return Math.floor(Math.max(0, at.getTime() - bornAt.getTime()) / DAY_MS) + 1;
}
