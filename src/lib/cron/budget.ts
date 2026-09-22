import { SupabaseClient } from '@supabase/supabase-js';

/**
 * IST (Indian Standard Time) is UTC+05:30 with no Daylight Saving Time.
 */
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export const DEFAULT_AUTO_SCORE_DAILY_CAP = 30;
export const DEFAULT_JSEARCH_DAILY_QUERY_CAP = 3;
export const DEFAULT_RAPIDAPI_MONTHLY_CAP = 190;

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
 * Returns the UTC Date corresponding to the start of the current calendar month in UTC (00:00:00.000 on day 1).
 */
export function getStartOfCalendarMonthUtc(date: Date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
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
 * Returns the configured RapidAPI monthly cap from environment (RAPIDAPI_MONTHLY_CAP) or fallback default (190).
 */
export function getRapidApiMonthlyCap(): number {
  const envVal = process.env.RAPIDAPI_MONTHLY_CAP;
  if (!envVal) return DEFAULT_RAPIDAPI_MONTHLY_CAP;
  const parsed = parseInt(envVal, 10);
  return isNaN(parsed) || parsed < 0 ? DEFAULT_RAPIDAPI_MONTHLY_CAP : parsed;
}

/**
 * Counts total search_calls across ALL users for the current calendar month from cron_runs.
 */
export async function getRapidApiMonthlyUsage(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<number> {
  const startOfMonthIso = getStartOfCalendarMonthUtc(now).toISOString();

  try {
    const fromBuilder = supabase.from('cron_runs');
    if (!fromBuilder || typeof fromBuilder.select !== 'function') return 0;
    const selectBuilder = fromBuilder.select('search_calls');
    if (!selectBuilder || typeof selectBuilder.gte !== 'function') return 0;

    const { data, error } = await selectBuilder.gte('started_at', startOfMonthIso);

    if (error) {
      console.warn('[getRapidApiMonthlyUsage] Error querying cron_runs:', error.message);
      return 0;
    }

    if (!data || data.length === 0) return 0;
    return data.reduce((sum: number, row: any) => sum + (Number(row.search_calls) || 0), 0);
  } catch (err: any) {
    console.warn('[getRapidApiMonthlyUsage] Exception:', err?.message || err);
    return 0;
  }
}

/**
 * Checks whether the cross-user monthly RapidAPI cap has been reached.
 */
export async function isRapidApiMonthlyCapReached(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<{ reached: boolean; usage: number; cap: number }> {
  const cap = getRapidApiMonthlyCap();
  const usage = await getRapidApiMonthlyUsage(supabase, now);
  return {
    reached: usage >= cap,
    usage,
    cap,
  };
}

/**
 * Calculates remaining scoring budget for the current IST day.
 */
export function calculateRemainingBudget(dailyCap: number, alreadyScoredCount: number): number {
  return Math.max(0, dailyCap - Math.max(0, alreadyScoredCount));
}

/**
 * Evaluates whether JSearch is eligible to run for a given user on the current cron invocation:
 * 1. Current IST time must be >= 6 AM (06:00 IST).
 * 2. Cross-user RapidAPI monthly cap has not been reached.
 * 3. No previous cron run today (since 00:00 IST) has executed JSearch for this user (search_calls > 0).
 */
export async function isJSearchEligibleToday(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date()
): Promise<{ eligible: boolean; reason?: string; monthlyUsage?: number; monthlyCap?: number }> {
  const istHour = getIstHour(now);

  if (istHour < 6) {
    return {
      eligible: false,
      reason: `Current time is before 6:00 AM IST (current IST hour: ${istHour}:00). JSearch runs once daily after 6 AM IST.`,
    };
  }

  // Check global cross-user monthly cap
  const monthlyStatus = await isRapidApiMonthlyCapReached(supabase, now);
  if (monthlyStatus.reached) {
    return {
      eligible: false,
      reason: `RapidAPI monthly cap reached (${monthlyStatus.usage}/${monthlyStatus.cap}). JSearch stopped for all users.`,
      monthlyUsage: monthlyStatus.usage,
      monthlyCap: monthlyStatus.cap,
    };
  }

  const startOfIstDayIso = getStartOfIstDay(now).toISOString();

  const { data: runsToday, error } = await supabase
    .from('cron_runs')
    .select('id, search_calls')
    .eq('user_id', userId)
    .gte('started_at', startOfIstDayIso)
    .gt('search_calls', 0)
    .limit(1);

  if (error) {
    console.warn('[isJSearchEligibleToday] Error checking cron_runs:', error.message);
  }

  if (runsToday && runsToday.length > 0) {
    return {
      eligible: false,
      reason: 'JSearch has already executed once today for this user.',
      monthlyUsage: monthlyStatus.usage,
      monthlyCap: monthlyStatus.cap,
    };
  }

  return {
    eligible: true,
    monthlyUsage: monthlyStatus.usage,
    monthlyCap: monthlyStatus.cap,
  };
}
