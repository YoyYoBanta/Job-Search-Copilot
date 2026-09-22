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
} from './budget';
import { buildScoringPrompt } from '@/lib/matcher/prompts';
import { requestGroqFitScore } from '@/lib/groq/client';
import { getPrimaryGroqModel, getFallbackGroqModel } from '@/lib/groq/config';
import { filterVerbatimBullets } from '@/lib/matcher/bulletChecker';

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

export const MAX_SCORING_TIME_BUDGET_MS = 45 * 1000; // 45 seconds

/**
 * Executes the full automatic job fetching (ATS boards + JSearch) and capped scoring workflow.
 * Guaranteed to record a row in `cron_runs` via try/finally.
 *
 * SAFETY:
 * Every single Supabase database query MUST be explicitly filtered by `ownerUserId`.
 */
export async function executeCronFetchAndScore(
  supabase: SupabaseClient,
  ownerUserId: string,
  startTimeMs: number = Date.now(),
  sleepFn: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<CronRunMetrics> {
  const startedAtIso = new Date(startTimeMs).toISOString();
  let totalFetched = 0;
  let totalMatched = 0;
  let totalPrefiltered = 0;
  let searchCallsCount = 0;
  let totalInserted = 0;
  let scoredCount = 0;
  const errors: string[] = [];
  let stoppedReason: CronStoppedReason = 'done';
  let runStatus: CronRunStatus = 'success';

  try {
    // =========================================================================
    // STEP 1A: ATS Board Ingestion for All Configured Companies
    // Query 1: Fetch companies scoped to ownerUserId
    // =========================================================================
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('*')
      .eq('user_id', ownerUserId)
      .order('created_at', { ascending: false });

    if (companiesError) {
      throw new Error(`Failed to load target companies: ${companiesError.message}`);
    }

    if (companies && companies.length > 0) {
      for (const company of companies) {
        try {
          const metrics = await ingestJobsForCompany(
            company as CompanyRecord,
            ownerUserId,
            supabase
          );
          totalFetched += metrics.totalFetched || 0;
          totalMatched += metrics.passedFilter || 0;
          totalInserted += metrics.newInserted || 0;
          if (metrics.error) {
            errors.push(`[${company.name}] Ingestion error: ${metrics.error}`);
          }
        } catch (companyErr: any) {
          errors.push(`[${company.name}] Unexpected fetch error: ${companyErr?.message || companyErr}`);
        }
      }
    }

    // =========================================================================
    // STEP 1B: JSearch Source (RapidAPI) Ingestion (Once per IST day after 6 AM)
    // Query 2: Fetch enabled search queries scoped to ownerUserId
    // =========================================================================
    const jsearchEligibility = await isJSearchEligibleToday(
      supabase,
      ownerUserId,
      new Date(startTimeMs)
    );

    if (jsearchEligibility.eligible) {
      const jsearchDailyCap = getJSearchDailyQueryCap();
      const { data: searchQueries, error: queriesError } = await supabase
        .from('search_queries')
        .select('*')
        .eq('user_id', ownerUserId)
        .eq('enabled', true)
        .order('created_at', { ascending: true })
        .limit(jsearchDailyCap);

      if (queriesError) {
        errors.push(`Failed to load search queries: ${queriesError.message}`);
      } else if (searchQueries && searchQueries.length > 0) {
        for (const queryRow of searchQueries) {
          try {
            searchCallsCount++;
            const jsearchMetrics = await ingestJobsForSearchQuery(
              {
                query: queryRow.query,
                country: queryRow.country,
                date_posted: queryRow.date_posted,
              },
              ownerUserId,
              supabase
            );

            totalFetched += jsearchMetrics.totalFetched || 0;
            totalMatched += jsearchMetrics.passedFilter || 0;
            totalPrefiltered += jsearchMetrics.prefiltered || 0;
            totalInserted += jsearchMetrics.newInserted || 0;

            if (jsearchMetrics.error) {
              errors.push(`[Search: "${queryRow.query}"] Ingestion notice: ${jsearchMetrics.error}`);
            }
          } catch (queryErr: any) {
            if (queryErr?.status === 429) {
              errors.push(`RapidAPI JSearch rate limit reached (HTTP 429). Search stopped cleanly.`);
              break;
            }
            errors.push(`[Search: "${queryRow.query}"] Fetch error: ${queryErr?.message || queryErr}`);
          }
        }
      }
    }

    // =========================================================================
    // STEP 2: Calculate Daily Scoring Budget (IST Day)
    // Query 3: Count scored jobs today scoped to ownerUserId
    // =========================================================================
    const dailyCap = getDailyScoreCap();
    const startOfIstDayIso = getStartOfIstDay(new Date(startTimeMs)).toISOString();

    const { count: alreadyScoredToday, error: countError } = await supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ownerUserId)
      .eq('score_status', 'scored')
      .gte('scored_at', startOfIstDayIso);

    if (countError) {
      errors.push(`Failed to check daily score count: ${countError.message}`);
    }

    const scoredTodayCount = alreadyScoredToday || 0;
    const remainingBudget = calculateRemainingBudget(dailyCap, scoredTodayCount);

    if (remainingBudget <= 0) {
      stoppedReason = 'cap';
      return {
        userId: ownerUserId,
        startedAt: startedAtIso,
        endedAt: new Date().toISOString(),
        status: errors.length > 0 ? (totalInserted > 0 ? 'partial' : 'failed') : 'success',
        stoppedReason: 'cap',
        fetched: totalFetched,
        matched: totalMatched,
        prefiltered: totalPrefiltered,
        searchCalls: searchCallsCount,
        inserted: totalInserted,
        scored: 0,
        errors,
      };
    }

    // =========================================================================
    // STEP 3: Fetch Owner Profile Resume
    // Query 4: Fetch profile scoped to ownerUserId
    // =========================================================================
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('resume_text, total_years_experience, pm_years_experience, target_roles')
      .eq('user_id', ownerUserId)
      .maybeSingle();

    if (profileError) {
      errors.push(`Profile fetch error: ${profileError.message}`);
    }

    if (!profile || !profile.resume_text?.trim()) {
      errors.push('No resume text configured in user profile. Auto-scoring skipped.');
      stoppedReason = 'done';
      return {
        userId: ownerUserId,
        startedAt: startedAtIso,
        endedAt: new Date().toISOString(),
        status: errors.length > 0 ? (totalInserted > 0 ? 'partial' : 'failed') : 'success',
        stoppedReason: 'done',
        fetched: totalFetched,
        matched: totalMatched,
        prefiltered: totalPrefiltered,
        searchCalls: searchCallsCount,
        inserted: totalInserted,
        scored: 0,
        errors,
      };
    }

    // =========================================================================
    // STEP 4: Fetch Pending Jobs for Scoring
    // Query 5: Fetch pending jobs scoped to ownerUserId
    // =========================================================================
    const { data: pendingJobs, error: pendingJobsError } = await supabase
      .from('jobs')
      .select('id, title, company_name, location, description')
      .eq('user_id', ownerUserId)
      .eq('score_status', 'pending')
      .eq('dismissed', false)
      .order('created_at', { ascending: false })
      .limit(remainingBudget);

    if (pendingJobsError) {
      errors.push(`Failed to fetch pending jobs: ${pendingJobsError.message}`);
    }

    const candidateJobs = pendingJobs || [];

    if (candidateJobs.length === 0) {
      stoppedReason = 'done';
    } else {
      // =======================================================================
      // STEP 5: Sequential Auto-Scoring with Dynamic Model Fallback & Retry
      // =======================================================================
      const primaryModel = getPrimaryGroqModel();
      const fallbackModel = getFallbackGroqModel();
      let activeModel = primaryModel;

      for (let i = 0; i < candidateJobs.length; i++) {
        const job = candidateJobs[i];

        // 5a. Time Budget Check (45s from request start)
        const elapsedMs = Date.now() - startTimeMs;
        if (elapsedMs >= MAX_SCORING_TIME_BUDGET_MS) {
          stoppedReason = 'time';
          console.warn(`[Cron Runner] 45s scoring time budget reached (${elapsedMs}ms). Stopping cleanly.`);
          break;
        }

        // 5b. Build prompt
        const { systemMessage, userMessage } = buildScoringPrompt(
          {
            totalYearsExperience: Number(profile.total_years_experience) || 0,
            pmYearsExperience: Number(profile.pm_years_experience) || 0,
            targetRoles: Array.isArray(profile.target_roles) ? profile.target_roles : [],
            resumeText: profile.resume_text,
          },
          {
            title: job.title,
            companyName: job.company_name,
            location: job.location,
            description: job.description,
          }
        );

        // 5c. Call Groq with 429 Retry & Fallback
        let scoreResult: any = null;

        try {
          scoreResult = await requestGroqFitScore(systemMessage, userMessage, activeModel);
        } catch (scoringError: any) {
          if (scoringError?.status === 429) {
            const retryAfterSec = scoringError.retryAfterSeconds || 5;
            const waitMs = retryAfterSec * 1000;
            const timeRemaining = MAX_SCORING_TIME_BUDGET_MS - (Date.now() - startTimeMs);

            // If wait fits inside 45s budget and on primary model, wait and retry once
            if (activeModel === primaryModel && waitMs + 3000 < timeRemaining) {
              console.log(`[Cron Runner] Groq 429 on ${activeModel}. Waiting ${retryAfterSec}s and retrying...`);
              await sleepFn(waitMs);
              try {
                scoreResult = await requestGroqFitScore(systemMessage, userMessage, activeModel);
              } catch (retryErr: any) {
                if (retryErr?.status === 429 && fallbackModel !== primaryModel) {
                  // Switch to fallback model for remaining jobs
                  console.warn(`[Cron Runner] Primary model retry failed. Switching to fallback ${fallbackModel}...`);
                  activeModel = fallbackModel;
                  try {
                    scoreResult = await requestGroqFitScore(systemMessage, userMessage, activeModel);
                  } catch (fallbackErr: any) {
                    if (fallbackErr?.status === 429) {
                      stoppedReason = 'rate_limit';
                      errors.push(`Both primary and fallback Groq models are rate-limited (HTTP 429).`);
                      break;
                    }
                    errors.push(`Job ${job.id} fallback score error: ${fallbackErr.message}`);
                  }
                } else if (retryErr?.status === 429) {
                  stoppedReason = 'rate_limit';
                  errors.push(`Groq rate limit reached (HTTP 429).`);
                  break;
                }
              }
            } else if (activeModel === primaryModel && fallbackModel !== primaryModel) {
              // Switch immediately to fallback model if wait doesn't fit
              console.warn(`[Cron Runner] 429 retry doesn't fit budget (${waitMs}ms vs ${timeRemaining}ms). Switching to fallback ${fallbackModel}...`);
              activeModel = fallbackModel;
              try {
                scoreResult = await requestGroqFitScore(systemMessage, userMessage, activeModel);
              } catch (fallbackErr: any) {
                if (fallbackErr?.status === 429) {
                  stoppedReason = 'rate_limit';
                  errors.push(`Both primary and fallback Groq models are rate-limited (HTTP 429).`);
                  break;
                }
                errors.push(`Job ${job.id} fallback score error: ${fallbackErr.message}`);
              }
            } else {
              // Already on fallback model or no alternative
              stoppedReason = 'rate_limit';
              errors.push(`Groq rate limit reached on ${activeModel} (HTTP 429).`);
              break;
            }
          } else {
            // Unrecoverable job error (e.g. invalid response format)
            const readableError = scoringError?.message || 'Unknown scoring error';
            errors.push(`Job ${job.id} scoring error: ${readableError}`);

            // Query 6: Mark job failed scoped to ownerUserId and job.id
            await supabase
              .from('jobs')
              .update({
                score_status: 'failed',
                score_error: readableError,
              })
              .eq('id', job.id)
              .eq('user_id', ownerUserId);
          }
        }

        // 5d. Persist successful score
        if (scoreResult) {
          const { data, modelUsed } = scoreResult;
          const verifiedBullets = filterVerbatimBullets(
            data.recommended_resume_bullets_to_lead_with,
            profile.resume_text
          );

          const matchAnalysis = {
            top_reasons: data.top_reasons,
            gaps: data.gaps,
            recommended_resume_bullets_to_lead_with: verifiedBullets,
          };

          // Query 7: Update scored job scoped to ownerUserId and job.id
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
            .eq('user_id', ownerUserId);

          if (updateError) {
            errors.push(`Failed to save score for job ${job.id}: ${updateError.message}`);
          } else {
            scoredCount++;
          }
        }
      }

      // If loop completed without breaking for time or rate limit
      if (stoppedReason !== 'time' && stoppedReason !== 'rate_limit') {
        if (scoredCount >= remainingBudget) {
          stoppedReason = 'cap';
        } else {
          stoppedReason = 'done';
        }
      }
    }
  } catch (fatalError: any) {
    runStatus = 'failed';
    stoppedReason = 'error';
    errors.push(`Fatal cron runner error: ${fatalError?.message || fatalError}`);
  } finally {
    // =========================================================================
    // STEP 6: ALWAYS Record Run into cron_runs (Idempotent Logging)
    // Query 8: Insert cron_runs scoped to ownerUserId
    // =========================================================================
    if (errors.length > 0) {
      runStatus = totalInserted > 0 || scoredCount > 0 ? 'partial' : 'failed';
    } else {
      runStatus = 'success';
    }

    const endedAtIso = new Date().toISOString();
    let createdRunId: string | undefined;

    try {
      const { data: runRecord, error: insertRunError } = await supabase
        .from('cron_runs')
        .insert({
          user_id: ownerUserId,
          started_at: startedAtIso,
          ended_at: endedAtIso,
          status: runStatus,
          stopped_reason: stoppedReason,
          fetched: totalFetched,
          matched: totalMatched,
          prefiltered: totalPrefiltered,
          search_calls: searchCallsCount,
          inserted: totalInserted,
          scored: scoredCount,
          errors: errors,
        })
        .select('id')
        .maybeSingle();

      if (insertRunError) {
        console.error('[Cron Runner] Failed to insert cron_runs record:', insertRunError.message);
      } else if (runRecord) {
        createdRunId = runRecord.id;
      }
    } catch (insertException: any) {
      console.error('[Cron Runner] Exception while inserting cron_runs record:', insertException?.message);
    }

    return {
      runId: createdRunId,
      userId: ownerUserId,
      startedAt: startedAtIso,
      endedAt: endedAtIso,
      status: runStatus,
      stoppedReason,
      fetched: totalFetched,
      matched: totalMatched,
      prefiltered: totalPrefiltered,
      searchCalls: searchCallsCount,
      inserted: totalInserted,
      scored: scoredCount,
      errors,
    };
  }
}
