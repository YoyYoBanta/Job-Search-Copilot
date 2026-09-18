import { StageHistoryEntry, isAppliedThisWeek, getDateStringIST, getDaysAgoIST, getTodayIST } from './dates';

export interface ApplicationMetricsInput {
  id: string;
  stage: string;
  applied_date?: string | null;
  channel?: string | null;
  stage_history?: StageHistoryEntry[] | null;
  created_at?: string | null;
}

export interface TrackerMetrics {
  activePipelineCount: number;
  appliedThisWeekCount: number;
  totalEverAppliedCount: number;
  totalEverRespondedCount: number;
  responseRatePct: number;
  totalEverReferralAskedCount: number;
  totalReferralConvertedCount: number;
  referralConversionRatePct: number;
  totalTrackedCount: number;
}

/**
 * Returns set of all unique stages an application has ever entered.
 */
export function getAllStagesEver(app: ApplicationMetricsInput): Set<string> {
  const stages = new Set<string>();
  if (app.stage) {
    stages.add(app.stage);
  }
  if (app.stage_history && Array.isArray(app.stage_history)) {
    for (const h of app.stage_history) {
      if (h && h.stage) {
        stages.add(h.stage);
      }
    }
  }
  return stages;
}

/**
 * Determines if an application has ever reached the 'applied' stage.
 */
export function hasEverApplied(app: ApplicationMetricsInput): boolean {
  const allStages = getAllStagesEver(app);
  return (
    allStages.has('applied') ||
    Boolean(app.applied_date) ||
    allStages.has('interviewing') ||
    allStages.has('offer')
  );
}

/**
 * Determines if an application has ever received a response (reached interviewing or offer),
 * even if it was subsequently rejected or withdrawn.
 */
export function hasEverResponded(app: ApplicationMetricsInput): boolean {
  const allStages = getAllStagesEver(app);
  return allStages.has('interviewing') || allStages.has('offer');
}

/**
 * Determines if an application has ever reached 'referral_asked'.
 */
export function hasEverAskedReferral(app: ApplicationMetricsInput): boolean {
  const allStages = getAllStagesEver(app);
  return allStages.has('referral_asked');
}

/**
 * Determines if a referral request successfully converted to applied or beyond.
 */
export function hasReferralConverted(app: ApplicationMetricsInput): boolean {
  if (!hasEverAskedReferral(app)) return false;

  const history = app.stage_history || [];
  const referralIdx = history.findIndex((h) => h.stage === 'referral_asked');

  if (referralIdx !== -1) {
    // Check if any subsequent transition reached applied, interviewing, or offer
    for (let i = referralIdx + 1; i < history.length; i++) {
      if (['applied', 'interviewing', 'offer'].includes(history[i].stage)) {
        return true;
      }
    }
    if (['applied', 'interviewing', 'offer'].includes(app.stage)) {
      return true;
    }
  }

  // If currently applied or beyond and channel was referral
  if (
    app.channel === 'referral' &&
    ['applied', 'interviewing', 'offer'].includes(app.stage)
  ) {
    return true;
  }

  // If ever applied and ever asked referral
  if (hasEverApplied(app) && hasEverAskedReferral(app)) {
    return true;
  }

  return false;
}

/**
 * Computes all pipeline and conversion metrics from application stage histories.
 */
export function calculateTrackerMetrics(
  applications: ApplicationMetricsInput[],
  referenceDateIST?: string
): TrackerMetrics {
  const totalTrackedCount = applications.length;

  let activePipelineCount = 0;
  let appliedThisWeekCount = 0;
  let totalEverAppliedCount = 0;
  let totalEverRespondedCount = 0;
  let totalEverReferralAskedCount = 0;
  let totalReferralConvertedCount = 0;

  const todayIST = referenceDateIST || getTodayIST();
  const sevenDaysAgoIST = getDaysAgoIST(7, todayIST);

  for (const app of applications) {
    // Active pipeline: current stage is applied or interviewing
    if (app.stage === 'applied' || app.stage === 'interviewing') {
      activePipelineCount++;
    }

    // Applied this week in Asia/Kolkata
    let appliedThisWeek = false;
    if (app.applied_date && isAppliedThisWeek(app.applied_date, todayIST)) {
      appliedThisWeek = true;
    } else if (app.stage_history && Array.isArray(app.stage_history)) {
      for (const h of app.stage_history) {
        if (h.stage === 'applied') {
          const entryDateIST = getDateStringIST(new Date(h.timestamp));
          if (entryDateIST >= sevenDaysAgoIST && entryDateIST <= todayIST) {
            appliedThisWeek = true;
            break;
          }
        }
      }
    }
    if (appliedThisWeek) {
      appliedThisWeekCount++;
    }

    // Ever applied & Ever responded
    if (hasEverApplied(app)) {
      totalEverAppliedCount++;
      if (hasEverResponded(app)) {
        totalEverRespondedCount++;
      }
    }

    // Referral conversion
    if (hasEverAskedReferral(app)) {
      totalEverReferralAskedCount++;
      if (hasReferralConverted(app)) {
        totalReferralConvertedCount++;
      }
    }
  }

  const responseRatePct =
    totalEverAppliedCount > 0
      ? Math.round((totalEverRespondedCount / totalEverAppliedCount) * 100)
      : 0;

  const referralConversionRatePct =
    totalEverReferralAskedCount > 0
      ? Math.round((totalReferralConvertedCount / totalEverReferralAskedCount) * 100)
      : 0;

  return {
    activePipelineCount,
    appliedThisWeekCount,
    totalEverAppliedCount,
    totalEverRespondedCount,
    responseRatePct,
    totalEverReferralAskedCount,
    totalReferralConvertedCount,
    referralConversionRatePct,
    totalTrackedCount,
  };
}
