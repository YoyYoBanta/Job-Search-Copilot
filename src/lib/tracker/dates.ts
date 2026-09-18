/**
 * Timezone and Date utilities for Application Tracker (Asia/Kolkata).
 * Ensures all calculations (today, 7 days ago, follow-up due, applied this week)
 * use Indian Standard Time (IST, UTC+5:30) regardless of server runtime locale.
 */

export type ApplicationStage =
  | 'saved'
  | 'referral_asked'
  | 'applied'
  | 'interviewing'
  | 'offer'
  | 'rejected'
  | 'withdrawn';

export interface StageHistoryEntry {
  stage: string;
  timestamp: string; // ISO-8601
  notes?: string;
}

export interface ApplicationDateFields {
  stage: ApplicationStage | string;
  applied_date?: string | null;
  next_follow_up_date?: string | null;
  stage_history?: StageHistoryEntry[] | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/**
 * Returns the YYYY-MM-DD date string in Asia/Kolkata for a given Date or timestamp.
 */
export function getDateStringIST(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Returns current today's date in Asia/Kolkata (YYYY-MM-DD).
 */
export function getTodayIST(): string {
  return getDateStringIST(new Date());
}

/**
 * Adds or subtracts days from a YYYY-MM-DD date string.
 */
export function addDaysToDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dt = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dt}`;
}

/**
 * Returns date YYYY-MM-DD N days ago in IST relative to referenceDateIST (defaults to today IST).
 */
export function getDaysAgoIST(days: number, referenceDateIST?: string): string {
  const base = referenceDateIST || getTodayIST();
  return addDaysToDateString(base, -days);
}

/**
 * Returns date YYYY-MM-DD N days ahead in IST relative to referenceDateIST (defaults to today IST).
 */
export function getDaysAheadIST(days: number, referenceDateIST?: string): string {
  const base = referenceDateIST || getTodayIST();
  return addDaysToDateString(base, days);
}

/**
 * Checks if an application is due for follow-up in Asia/Kolkata.
 * 
 * Rules:
 * 1. Only active stages ('referral_asked', 'applied', 'interviewing') can be due.
 * 2. If next_follow_up_date is set: due if next_follow_up_date <= todayIST.
 * 3. If next_follow_up_date is not set:
 *    - For 'applied' or 'referral_asked', if 7+ days have elapsed since reaching that stage (<= 7 days ago IST), it is due.
 */
export function isFollowUpDue(
  app: ApplicationDateFields,
  referenceDateIST?: string
): boolean {
  const stage = app.stage;
  const activeStages: (ApplicationStage | string)[] = ['referral_asked', 'applied', 'interviewing'];
  if (!activeStages.includes(stage)) {
    return false;
  }

  const todayIST = referenceDateIST || getTodayIST();

  if (app.next_follow_up_date) {
    return app.next_follow_up_date <= todayIST;
  }

  // No custom follow-up date set: check 7-day rule for applied & referral_asked
  if (stage === 'applied' || stage === 'referral_asked') {
    const sevenDaysAgoIST = getDaysAgoIST(7, todayIST);

    // Determine the date this stage was entered
    let stageDateIST: string | null = null;

    if (stage === 'applied' && app.applied_date) {
      stageDateIST = app.applied_date;
    } else if (app.stage_history && Array.isArray(app.stage_history)) {
      // Find the latest timestamp for this stage in stage_history
      for (let i = app.stage_history.length - 1; i >= 0; i--) {
        if (app.stage_history[i].stage === stage) {
          stageDateIST = getDateStringIST(new Date(app.stage_history[i].timestamp));
          break;
        }
      }
    }

    if (!stageDateIST && app.created_at) {
      stageDateIST = getDateStringIST(new Date(app.created_at));
    }

    if (stageDateIST) {
      return stageDateIST <= sevenDaysAgoIST;
    }
  }

  return false;
}

/**
 * Checks if applied_date is within the last 7 days in Asia/Kolkata (applied_date between 7 days ago and today IST).
 */
export function isAppliedThisWeek(
  appliedDate?: string | null,
  referenceDateIST?: string
): boolean {
  if (!appliedDate) return false;
  const todayIST = referenceDateIST || getTodayIST();
  const sevenDaysAgoIST = getDaysAgoIST(7, todayIST);
  return appliedDate >= sevenDaysAgoIST && appliedDate <= todayIST;
}
