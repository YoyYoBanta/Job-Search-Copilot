import { SupabaseClient } from '@supabase/supabase-js';
import { CompanyRecord } from '@/lib/ats/types';
import { ingestJobsForCompany } from '@/lib/ats/fetcher';
import { ingestJobsForSearchQuery } from '@/lib/sources/jsearch';
import {
  getStartOfIstDay,
  getDailyScoreCap,
  calculateRemainingBudget,
  isJSearchEligibleToday,
  getJSearchDailyQueryCap,
  isRapidApiMonthlyCapReached,
} from './budget';
import { buildScoringPrompt } from '@/lib/matcher/prompts';
import { requestGroqFitScore } from '@/lib/groq/client';
import { getPrimaryGroqModel, getFallbackGroqModel } from '@/lib/groq/config';
import { filterVerbatimBullets } from '@/lib/matcher/bulletChecker';
import { getAllowedEmails } from '@/lib/auth';
import { ensureUserOnboarded } from '@/lib/onboarding';

export type CronStoppedReason = 'cap' | 'time' | 'rate_limit' | 'done' | 'error';
export type CronRunStatus = 'success' | 'partial' | 'failed';

export interface CronRunMetrics {
  runId?: string;
  userId: string;
  startedAt: string;
  endedAt: string;
  status: CronRunStatus;
  stoppedReason: CronStoppedReason;
  fetched: number;
  matched: number;
  prefiltered: number;
  searchCalls: number;
  inserted: number;
  scored: number;
  errors: string[];
}

export interface UserTarget {
  userId: string;
  email?: string;
}

export const MAX_SCORING_TIME_BUDGET_MS = 45 * 1000; // 45 seconds

/**
 * Discovers target users for multi-user cron processing.
 * 1. Checks ALLOWED_EMAILS list against auth.users (via admin API) or profiles.
 * 2. Falls back to OWNER_USER_ID if configured.
 */
export async function discoverCronUsers(
  supabase: SupabaseClient,
  overrideUserId?: string
): Promise<UserTarget[]> {
  if (overrideUserId && overrideUserId.trim()) {
    return [{ userId: overrideUserId.trim() }];
  }

  const allowedEmails = getAllowedEmails();
  const usersFound: UserTarget[] = [];

  // Try admin listUsers
  try {
    if (supabase.auth && supabase.auth.admin && typeof supabase.auth.admin.listUsers === 'function') {
      const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 });
      if (!error && data?.users && data.users.length > 0) {
        for (const u of data.users) {
          const userEmail = (u.email || '').trim().toLowerCase();
          if (allowedEmails.length === 0 || allowedEmails.includes(userEmail)) {
            usersFound.push({ userId: u.id, email: userEmail });
          }
        }
      }
    }
  } catch (err: any) {
    console.warn('[discoverCronUsers] Admin listUsers error:', err?.message || err);
  }

  // If no users found from admin API, try profiles table
  if (usersFound.length === 0) {
    try {
      const { data: profiles, error } = await supabase.from('profiles').select('user_id');
      if (!error && profiles && profiles.length > 0) {
        for (const p of profiles) {
          if (p.user_id && !usersFound.some((u) => u.userId === p.user_id)) {
            usersFound.push({ userId: p.user_id });
          }
        }
      }
    } catch (err: any) {
      console.warn('[discoverCronUsers] Profiles query error:', err?.message || err);
    }
  }

  // Fallback to OWNER_USER_ID if list still empty
  if (usersFound.length === 0 && process.env.OWNER_USER_ID) {
    usersFound.push({ userId: process.env.OWNER_USER_ID.trim() });
  }

  return usersFound;
}

/**
 * Executes the full automatic job fetching (ATS boards + JSearch) and capped scoring workflow.
 * Multi-user aware: iterates across allowed users, interleaving scoring in round-robin fashion.
 * Guaranteed to record a row in `cron_runs` for each processed user via try/finally.
 *
 * SAFETY:
 * Every single Supabase database query MUST be explicitly filtered by the respective `user_id`.
 */
export async function executeCronFetchAndScore(
  supabase: SupabaseClient,
  targetUserIdOrAll?: string,
  startTimeMs: number = Date.now(),
  sleepFn: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<CronRunMetrics> {
  const startedAtIso = new Date(startTimeMs).toISOString();

  // 1. Discover target users
  const targetUsers = await discoverCronUsers(supabase, targetUserIdOrAll);

  if (targetUsers.length === 0) {
    const fallbackId = targetUserIdOrAll || process.env.OWNER_USER_ID || 'unknown-user';
    return {
      userId: fallbackId,
      startedAt: startedAtIso,
      endedAt: new Date().toISOString(),
      status: 'failed',
      stoppedReason: 'error',
      fetched: 0,
      matched: 0,
      prefiltered: 0,
      searchCalls: 0,
      inserted: 0,
      scored: 0,
      errors: ['No authorized users found to process for cron execution.'],
    };
  }

  // Track metrics per user
  const userMetricsMap = new Map<string, {
    userId: string;
    totalFetched: number;
    totalMatched: number;
    totalPrefiltered: number;
    searchCallsCount: number;
    totalInserted: number;
    scoredCount: number;
    errors: string[];
    stoppedReason: CronStoppedReason;
    runStatus: CronRunStatus;
    profile: any | null;
  }>();

  for (const target of targetUsers) {
    userMetricsMap.set(target.userId, {
      userId: target.userId,
      totalFetched: 0,
      totalMatched: 0,
      totalPrefiltered: 0,
      searchCallsCount: 0,
      totalInserted: 0,
      scoredCount: 0,
      errors: [],
      stoppedReason: 'done',
      runStatus: 'success',
      profile: null,
    });
  }

  try {
    // =========================================================================
    // PHASE 1: Ingestion per User (ATS Boards + JSearch)
    // =========================================================================
    for (const target of targetUsers) {
      const uMetrics = userMetricsMap.get(target.userId)!;

      // Ensure onboarding records exist
      await ensureUserOnboarded(supabase, target.userId, target.email);

      // 1A. ATS Board Ingestion
      // Query 1: Fetch companies scoped to target.userId
      const { data: companies, error: companiesError } = await supabase
        .from('companies')
        .select('*')
        .eq('user_id', target.userId)
        .order('created_at', { ascending: false });

      if (companiesError) {
        uMetrics.errors.push(`Failed to load target companies: ${companiesError.message}`);
      } else if (companies && companies.length > 0) {
        for (const company of companies) {
          try {
            const metrics = await ingestJobsForCompany(
              company as CompanyRecord,
              target.userId,
              supabase
            );
            uMetrics.totalFetched += metrics.totalFetched || 0;
            uMetrics.totalMatched += metrics.passedFilter || 0;
            uMetrics.totalInserted += metrics.newInserted || 0;
            if (metrics.error) {
              uMetrics.errors.push(`[${company.name}] Ingestion error: ${metrics.error}`);
            }
          } catch (companyErr: any) {
            uMetrics.errors.push(`[${company.name}] Unexpected fetch error: ${companyErr?.message || companyErr}`);
          }
        }
      }

      // 1B. JSearch Source (RapidAPI) Ingestion
      // Query 2: Fetch enabled search queries scoped to target.userId
      const jsearchEligibility = await isJSearchEligibleToday(
        supabase,
        target.userId,
        new Date(startTimeMs)
      );

      if (jsearchEligibility.eligible) {
        const jsearchDailyCap = getJSearchDailyQueryCap();
        const { data: searchQueries, error: queriesError } = await supabase
          .from('search_queries')
          .select('*')
          .eq('user_id', target.userId)
          .eq('enabled', true)
          .order('created_at', { ascending: true })
          .limit(jsearchDailyCap);

        if (queriesError) {
          uMetrics.errors.push(`Failed to load search queries: ${queriesError.message}`);
        } else if (searchQueries && searchQueries.length > 0) {
          for (const queryRow of searchQueries) {
            // Check global monthly cap before each call
            const monthlyCapCheck = await isRapidApiMonthlyCapReached(supabase, new Date(startTimeMs));
            if (monthlyCapCheck.reached) {
              uMetrics.errors.push(`RapidAPI monthly cap reached (${monthlyCapCheck.usage}/${monthlyCapCheck.cap}). JSearch stopped.`);
              break;
            }

            try {
              const jsearchMetrics = await ingestJobsForSearchQuery(
                {
                  query: queryRow.query,
                  country: queryRow.country,
                  date_posted: queryRow.date_posted,
                },
                target.userId,
                supabase
              );

              if (jsearchMetrics.error) {
                uMetrics.errors.push(`[Search: "${queryRow.query}"] Ingestion notice: ${jsearchMetrics.error}`);
              } else {
                uMetrics.searchCallsCount++;
                uMetrics.totalFetched += jsearchMetrics.totalFetched || 0;
                uMetrics.totalMatched += jsearchMetrics.passedFilter || 0;
                uMetrics.totalPrefiltered += jsearchMetrics.prefiltered || 0;
                uMetrics.totalInserted += jsearchMetrics.newInserted || 0;
              }
            } catch (queryErr: any) {
              if (queryErr?.status === 429) {
                uMetrics.errors.push(`RapidAPI JSearch rate limit reached (HTTP 429). Search stopped cleanly.`);
                break;
              }
              uMetrics.errors.push(`[Search: "${queryRow.query}"] Fetch error: ${queryErr?.message || queryErr}`);
            }
          }
        }
      } else if (jsearchEligibility.reason) {
        // Record non-eligibility notice if cap reached
        if (jsearchEligibility.reason.includes('RapidAPI monthly cap reached')) {
          uMetrics.errors.push(jsearchEligibility.reason);
        }
      }
    }

    // =========================================================================
    // PHASE 2: Collect Candidate Scoring Queues per User
    // =========================================================================
    const dailyCap = getDailyScoreCap();
    const startOfIstDayIso = getStartOfIstDay(new Date(startTimeMs)).toISOString();

    const userQueues: Array<{
      userId: string;
      profile: any;
      remainingBudget: number;
      jobs: Array<{
        id: string;
        title: string;
        company_name: string;
        location: string;
        description: string;
      }>;
    }> = [];

    for (const target of targetUsers) {
      const uMetrics = userMetricsMap.get(target.userId)!;

      // Query 3: Count scored jobs today scoped to target.userId
      const { count: alreadyScoredToday, error: countError } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', target.userId)
        .eq('score_status', 'scored')
        .gte('scored_at', startOfIstDayIso);

      if (countError) {
        uMetrics.errors.push(`Failed to check daily score count: ${countError.message}`);
      }

      const scoredTodayCount = alreadyScoredToday || 0;
      const remainingBudget = calculateRemainingBudget(dailyCap, scoredTodayCount);

      if (remainingBudget <= 0) {
        uMetrics.stoppedReason = 'cap';
        continue;
      }

      // Query 4: Fetch profile scoped to target.userId
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('resume_text, total_years_experience, pm_years_experience, target_roles')
        .eq('user_id', target.userId)
        .maybeSingle();

      if (profileError) {
        uMetrics.errors.push(`Profile fetch error: ${profileError.message}`);
      }

      if (!profile || !profile.resume_text?.trim()) {
        uMetrics.errors.push('No resume text configured in user profile. Auto-scoring skipped.');
        uMetrics.stoppedReason = 'done';
        continue;
      }

      uMetrics.profile = profile;

      // Query 5: Fetch pending jobs scoped to target.userId
      const { data: pendingJobs, error: pendingJobsError } = await supabase
        .from('jobs')
        .select('id, title, company_name, location, description')
        .eq('user_id', target.userId)
        .eq('score_status', 'pending')
        .eq('dismissed', false)
        .order('created_at', { ascending: false })
        .limit(remainingBudget);

      if (pendingJobsError) {
        uMetrics.errors.push(`Failed to fetch pending jobs: ${pendingJobsError.message}`);
      }

      const candidateJobs = pendingJobs || [];
      if (candidateJobs.length === 0) {
        uMetrics.stoppedReason = 'done';
      } else {
        userQueues.push({
          userId: target.userId,
          profile,
          remainingBudget,
          jobs: candidateJobs,
        });
      }
    }

    // =========================================================================
    // PHASE 3: Round-Robin Sequential Auto-Scoring across Users
    // =========================================================================
    if (userQueues.length > 0) {
      const primaryModel = getPrimaryGroqModel();
      const fallbackModel = getFallbackGroqModel();
      let activeModel = primaryModel;

      let hasMoreJobs = true;
      let roundIndex = 0;
      let globalStoppedReason: CronStoppedReason | null = null;

      while (hasMoreJobs && !globalStoppedReason) {
        hasMoreJobs = false;

        for (const queue of userQueues) {
          if (roundIndex < queue.jobs.length) {
            hasMoreJobs = true;
            const job = queue.jobs[roundIndex];
            const uMetrics = userMetricsMap.get(queue.userId)!;

            // 1. Time Budget Check (45s from request start)
            const elapsedMs = Date.now() - startTimeMs;
            if (elapsedMs >= MAX_SCORING_TIME_BUDGET_MS) {
              globalStoppedReason = 'time';
              console.warn(`[Cron Runner] 45s scoring time budget reached (${elapsedMs}ms). Stopping cleanly.`);
              break;
            }

            // 2. Build prompt with user's profile
            const { systemMessage, userMessage } = buildScoringPrompt(
              {
                totalYearsExperience: Number(queue.profile.total_years_experience) || 0,
                pmYearsExperience: Number(queue.profile.pm_years_experience) || 0,
                targetRoles: Array.isArray(queue.profile.target_roles) ? queue.profile.target_roles : [],
                resumeText: queue.profile.resume_text,
              },
              {
                title: job.title,
                companyName: job.company_name,
                location: job.location,
                description: job.description,
              }
            );

            // 3. Call Groq with 429 Retry & Fallback
            let scoreResult: any = null;

            try {
              scoreResult = await requestGroqFitScore(systemMessage, userMessage, activeModel);
            } catch (scoringError: any) {
              if (scoringError?.status === 429) {
                const retryAfterSec = scoringError.retryAfterSeconds || 5;
                const waitMs = retryAfterSec * 1000;
                const timeRemaining = MAX_SCORING_TIME_BUDGET_MS - (Date.now() - startTimeMs);

                if (activeModel === primaryModel && waitMs + 3000 < timeRemaining) {
                  console.log(`[Cron Runner] Groq 429 on ${activeModel}. Waiting ${retryAfterSec}s and retrying...`);
                  await sleepFn(waitMs);
                  try {
                    scoreResult = await requestGroqFitScore(systemMessage, userMessage, activeModel);
                  } catch (retryErr: any) {
                    if (retryErr?.status === 429 && fallbackModel !== primaryModel) {
                      console.warn(`[Cron Runner] Primary model retry failed. Switching to fallback ${fallbackModel}...`);
                      activeModel = fallbackModel;
                      try {
                        scoreResult = await requestGroqFitScore(systemMessage, userMessage, activeModel);
                      } catch (fallbackErr: any) {
                        if (fallbackErr?.status === 429) {
                          globalStoppedReason = 'rate_limit';
                          uMetrics.errors.push(`Both primary and fallback Groq models are rate-limited (HTTP 429).`);
                          break;
                        }
                        uMetrics.errors.push(`Job ${job.id} fallback score error: ${fallbackErr.message}`);
                      }
                    } else if (retryErr?.status === 429) {
                      globalStoppedReason = 'rate_limit';
                      uMetrics.errors.push(`Groq rate limit reached (HTTP 429).`);
                      break;
                    }
                  }
                } else if (activeModel === primaryModel && fallbackModel !== primaryModel) {
                  console.warn(`[Cron Runner] Switching to fallback ${fallbackModel}...`);
                  activeModel = fallbackModel;
                  try {
                    scoreResult = await requestGroqFitScore(systemMessage, userMessage, activeModel);
                  } catch (fallbackErr: any) {
                    if (fallbackErr?.status === 429) {
                      globalStoppedReason = 'rate_limit';
                      uMetrics.errors.push(`Both primary and fallback Groq models are rate-limited (HTTP 429).`);
                      break;
                    }
                    uMetrics.errors.push(`Job ${job.id} fallback score error: ${fallbackErr.message}`);
                  }
                } else {
                  globalStoppedReason = 'rate_limit';
                  uMetrics.errors.push(`Groq rate limit reached on ${activeModel} (HTTP 429).`);
                  break;
                }
              } else {
                const readableError = scoringError?.message || 'Unknown scoring error';
                uMetrics.errors.push(`Job ${job.id} scoring error: ${readableError}`);

                // Query 6: Mark job failed scoped to queue.userId and job.id
                await supabase
                  .from('jobs')
                  .update({
                    score_status: 'failed',
                    score_error: readableError,
                  })
                  .eq('id', job.id)
                  .eq('user_id', queue.userId);
              }
            }

            // 4. Persist successful score
            if (scoreResult) {
              const { data, modelUsed } = scoreResult;
              const verifiedBullets = filterVerbatimBullets(
                data.recommended_resume_bullets_to_lead_with,
                queue.profile.resume_text
              );

              const matchAnalysis = {
                top_reasons: data.top_reasons,
                gaps: data.gaps,
                recommended_resume_bullets_to_lead_with: verifiedBullets,
              };

              // Query 7: Update scored job scoped to queue.userId and job.id
              const { error: updateError } = await supabase
                .from('jobs')
                .update({
                  fit_score: Math.round(data.fit_score),
                  match_analysis: matchAnalysis,
                  seniority_match: data.seniority_match,
                  scored_model: modelUsed,
                  score_status: 'scored',
                  score_error: null,
                  scored_at: new Date().toISOString(),
                })
                .eq('id', job.id)
                .eq('user_id', queue.userId);

              if (updateError) {
                uMetrics.errors.push(`Failed to save score for job ${job.id}: ${updateError.message}`);
              } else {
                uMetrics.scoredCount++;
              }
            }
          }
        }
        roundIndex++;
      }

      // Update stopped reasons for queues
      for (const queue of userQueues) {
        const uMetrics = userMetricsMap.get(queue.userId)!;
        if (globalStoppedReason) {
          uMetrics.stoppedReason = globalStoppedReason;
        } else if (uMetrics.scoredCount >= queue.remainingBudget) {
          uMetrics.stoppedReason = 'cap';
        } else {
          uMetrics.stoppedReason = 'done';
        }
      }
    }
  } catch (fatalError: any) {
    for (const [, uMetrics] of userMetricsMap) {
      uMetrics.runStatus = 'failed';
      uMetrics.stoppedReason = 'error';
      uMetrics.errors.push(`Fatal cron runner error: ${fatalError?.message || fatalError}`);
    }
  } finally {
    // =========================================================================
    // PHASE 4: ALWAYS Record Run into cron_runs for EACH User (Idempotent Logging)
    // Query 8: Insert cron_runs scoped to target.userId
    // =========================================================================
    const endedAtIso = new Date().toISOString();
    const finalMetricsList: CronRunMetrics[] = [];

    for (const [userId, uMetrics] of userMetricsMap) {
      if (uMetrics.errors.length > 0) {
        uMetrics.runStatus = uMetrics.totalInserted > 0 || uMetrics.scoredCount > 0 ? 'partial' : 'failed';
      } else {
        uMetrics.runStatus = 'success';
      }

      let createdRunId: string | undefined;

      try {
        const { data: runRecord, error: insertRunError } = await supabase
          .from('cron_runs')
          .insert({
            user_id: userId,
            started_at: startedAtIso,
            ended_at: endedAtIso,
            status: uMetrics.runStatus,
            stopped_reason: uMetrics.stoppedReason,
            fetched: uMetrics.totalFetched,
            matched: uMetrics.totalMatched,
            prefiltered: uMetrics.totalPrefiltered,
            search_calls: uMetrics.searchCallsCount,
            inserted: uMetrics.totalInserted,
            scored: uMetrics.scoredCount,
            errors: uMetrics.errors,
          })
          .select('id')
          .maybeSingle();

        if (insertRunError) {
          console.error(`[Cron Runner] Failed to insert cron_runs record for ${userId}:`, insertRunError.message);
        } else if (runRecord) {
          createdRunId = runRecord.id;
        }
      } catch (insertException: any) {
        console.error(`[Cron Runner] Exception while inserting cron_runs for ${userId}:`, insertException?.message);
      }

      finalMetricsList.push({
        runId: createdRunId,
        userId,
        startedAt: startedAtIso,
        endedAt: endedAtIso,
        status: uMetrics.runStatus,
        stoppedReason: uMetrics.stoppedReason,
        fetched: uMetrics.totalFetched,
        matched: uMetrics.totalMatched,
        prefiltered: uMetrics.totalPrefiltered,
        searchCalls: uMetrics.searchCallsCount,
        inserted: uMetrics.totalInserted,
        scored: uMetrics.scoredCount,
        errors: uMetrics.errors,
      });
    }

    // Return primary user metrics (or aggregate summary)
    return finalMetricsList[0] || {
      userId: targetUserIdOrAll || 'unknown-user',
      startedAt: startedAtIso,
      endedAt: endedAtIso,
      status: 'success',
      stoppedReason: 'done',
      fetched: 0,
      matched: 0,
      prefiltered: 0,
      searchCalls: 0,
      inserted: 0,
      scored: 0,
      errors: [],
    };
  }
}
