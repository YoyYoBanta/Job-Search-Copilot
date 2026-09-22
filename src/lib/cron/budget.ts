import { SupabaseClient } from '@supabase/supabase-js';

/**
 * IST (Indian Standard Time) is UTC+05:30 with no Daylight Saving Time.
 */
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export const DEFAULT_AUTO_SCORE_DAILY_CAP = 30;
export const DEFAULT_JSEARCH_DAILY_QUERY_CAP = 3;

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
 * Returns the current hour in IST (0 to 23).
 */
export function getIstHour(date: Date = new Date()): number {
  const istTime = new Date(date.getTime() + IST_OFFSET_MS);
  return istTime.getUTCHours();
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
 * Returns the configured daily JSearch query cap from environment or fallback default.
 */
export function getJSearchDailyQueryCap(): number {
  const envVal = process.env.JSEARCH_DAILY_QUERY_CAP;
  if (!envVal) return DEFAULT_JSEARCH_DAILY_QUERY_CAP;
  const parsed = parseInt(envVal, 10);
  return isNaN(parsed) || parsed < 0 ? DEFAULT_JSEARCH_DAILY_QUERY_CAP : parsed;
}

/**
 * Calculates remaining scoring budget for the current IST day.
 */
export function calculateRemainingBudget(dailyCap: number, alreadyScoredCount: number): number {
  return Math.max(0, dailyCap - Math.max(0, alreadyScoredCount));
}

/**
 * Evaluates whether JSearch is eligible to run on the current cron invocation:
 * 1. Current IST time must be >= 6 AM (06:00 IST).
 * 2. No previous cron run today (since 00:00 IST) has executed JSearch (search_calls > 0).
 */
export async function isJSearchEligibleToday(
  supabase: SupabaseClient,
  ownerUserId: string,
  now: Date = new Date()
): Promise<{ eligible: boolean; reason?: string }> {
  const istHour = getIstHour(now);

  if (istHour < 6) {
    return {
      eligible: false,
      reason: `Current time is before 6:00 AM IST (current IST hour: ${istHour}:00). JSearch runs once daily after 6 AM IST.`,
    };
  }

  const startOfIstDayIso = getStartOfIstDay(now).toISOString();

  const { data: runsToday, error } = await supabase
    .from('cron_runs')
    .select('id, search_calls')
    .eq('user_id', ownerUserId)
    .gte('started_at', startOfIstDayIso)
    .gt('search_calls', 0)
    .limit(1);

  if (error) {
    console.warn('[isJSearchEligibleToday] Error checking cron_runs:', error.message);
  }

  if (runsToday && runsToday.length > 0) {
    return {
      eligible: false,
      reason: 'JSearch has already executed once today for this IST day.',
    };
  }

  return { eligible: true };
}
