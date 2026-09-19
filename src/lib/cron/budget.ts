/**
 * IST (Indian Standard Time) is UTC+05:30 with no Daylight Saving Time.
 */
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export const DEFAULT_AUTO_SCORE_DAILY_CAP = 30;

/**
 * Returns the UTC Date corresponding to the start of the IST calendar day (00:00:00.000 IST).
 */
export function getStartOfIstDay(date: Date = new Date()): Date {
  const istTime = new Date(date.getTime() + IST_OFFSET_MS);
  const utcMidnight = Date.UTC(
    istTime.getUTCFullYear(),
    istTime.getUTCMonth(),
    istTime.getUTCDate()
  );
  return new Date(utcMidnight - IST_OFFSET_MS);
}

/**
 * Returns the configured daily auto-score cap from environment or fallback default.
 */
export function getDailyScoreCap(): number {
  const envVal = process.env.AUTO_SCORE_DAILY_CAP;
  if (!envVal) return DEFAULT_AUTO_SCORE_DAILY_CAP;
  const parsed = parseInt(envVal, 10);
  return isNaN(parsed) || parsed < 0 ? DEFAULT_AUTO_SCORE_DAILY_CAP : parsed;
}

/**
 * Calculates remaining scoring budget for the current IST day.
 */
export function calculateRemainingBudget(dailyCap: number, alreadyScoredCount: number): number {
  return Math.max(0, dailyCap - Math.max(0, alreadyScoredCount));
}
