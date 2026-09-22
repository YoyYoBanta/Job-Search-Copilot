import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCronFetchAndScore } from '../runner';
import * as groqClient from '@/lib/groq/client';
import * as groqConfig from '@/lib/groq/config';

describe('Cron Groq 429 Rate Limit Handling & Model Fallback', () => {
  const OWNER_UID = 'user-owner-12345';
  const fastSleep = vi.fn(async () => {});

  beforeEach(() => {
    vi.restoreAllMocks();
    fastSleep.mockClear();
    vi.spyOn(groqConfig, 'getPrimaryGroqModel').mockReturnValue('primary-model-120b');
    vi.spyOn(groqConfig, 'getFallbackGroqModel').mockReturnValue('fallback-model-20b');
  });

  it('retries once on primary model when 429 retry wait fits in time budget and succeeds', async () => {
    const executedUpdates: any[] = [];

    const mockSupabase: any = {
      from: vi.fn((table: string) => {
        const builder: any = {
          select: () => builder,
          insert: () => builder,
          update: (data: any) => {
            executedUpdates.push({ table, data });
            return builder;
          },
          eq: () => builder,
          gte: () => builder,
          gt: () => builder,
          in: () => builder,
          order: () => builder,
          limit: () => builder,
          maybeSingle: async () => {
            if (table === 'profiles') {
              return {
                data: {
                  resume_text: 'Experienced Product Manager',
                  total_years_experience: 5,
                  pm_years_experience: 4,
                  target_roles: ['Product Manager'],
                },
                error: null,
              };
            }
            if (table === 'cron_runs') {
              return { data: { id: 'run-retry-success' }, error: null };
            }
            return { data: null, error: null };
          },
          then: (resolve: any) => {
            if (table === 'companies' || table === 'search_queries' || table === 'cron_runs') {
              return resolve({ data: [], error: null });
            }
            if (table === 'jobs') {
              return resolve({
                data: [
                  {
                    id: 'job-1',
                    title: 'Product Manager',
                    company_name: 'TechCo',
                    location: 'Bangalore, India',
                    description: 'Description...',
                  },
                ],
                count: 0,
                error: null,
              });
            }
            return resolve({ data: [], error: null });
          },
        };
        return builder;
      }),
    };

    let callCount = 0;
    const requestScoreSpy = vi.spyOn(groqClient, 'requestGroqFitScore');
    requestScoreSpy.mockImplementation(async (_sys, _user, model) => {
      callCount++;
      if (callCount === 1) {
        const err: any = new Error('Rate limited on first call');
        err.status = 429;
        err.retryAfterSeconds = 5;
        throw err;
      }
      return {
        data: {
          fit_score: 92,
          top_reasons: ['Strong alignment'],
          gaps: [],
          recommended_resume_bullets_to_lead_with: ['Product Manager'],
          seniority_match: 'fit',
        },
        modelUsed: model || 'primary-model-120b',
        rateLimitInfo: {},
      };
    });

    const result = await executeCronFetchAndScore(
      mockSupabase,
      OWNER_UID,
      Date.now(),
      fastSleep
    );

    expect(fastSleep).toHaveBeenCalledTimes(1);
    expect(result.scored).toBe(1);
    expect(result.stoppedReason).toBe('done');

    const jobUpdate = executedUpdates.find((u) => u.table === 'jobs');
    expect(jobUpdate).toBeDefined();
    expect(jobUpdate.data.scored_model).toBe('primary-model-120b');
    expect(jobUpdate.data.fit_score).toBe(92);
  });

  it('switches to fallback model when primary model encounters 429 and retry wait is too large', async () => {
    const executedUpdates: any[] = [];

    const mockSupabase: any = {
      from: vi.fn((table: string) => {
        const builder: any = {
          select: () => builder,
          insert: () => builder,
          update: (data: any) => {
            executedUpdates.push({ table, data });
            return builder;
          },
          eq: () => builder,
          gte: () => builder,
          gt: () => builder,
          in: () => builder,
          order: () => builder,
          limit: () => builder,
          maybeSingle: async () => {
            if (table === 'profiles') {
              return {
                data: {
                  resume_text: 'Experienced Product Manager',
                  total_years_experience: 5,
                  pm_years_experience: 4,
                  target_roles: ['Product Manager'],
                },
                error: null,
              };
            }
            if (table === 'cron_runs') {
              return { data: { id: 'run-fallback-success' }, error: null };
            }
            return { data: null, error: null };
          },
          then: (resolve: any) => {
            if (table === 'companies' || table === 'search_queries' || table === 'cron_runs') {
              return resolve({ data: [], error: null });
            }
            if (table === 'jobs') {
              return resolve({
                data: [
                  {
                    id: 'job-1',
                    title: 'Product Manager',
                    company_name: 'TechCo',
                    location: 'Bangalore, India',
                    description: 'Description...',
                  },
                ],
                count: 0,
                error: null,
              });
            }
            return resolve({ data: [], error: null });
          },
        };
        return builder;
      }),
    };

    // Primary model throws 429 with 50s retry-after (exceeds 45s total budget), Fallback succeeds
    const requestScoreSpy = vi.spyOn(groqClient, 'requestGroqFitScore');
    requestScoreSpy.mockImplementation(async (_sys, _user, model) => {
      if (model === 'primary-model-120b') {
        const err: any = new Error('Rate limited on primary');
        err.status = 429;
        err.retryAfterSeconds = 50; // Exceeds budget
        throw err;
      }
      if (model === 'fallback-model-20b') {
        return {
          data: {
            fit_score: 88,
            top_reasons: ['Good fit'],
            gaps: [],
            recommended_resume_bullets_to_lead_with: ['Product Manager'],
            seniority_match: 'fit',
          },
          modelUsed: 'fallback-model-20b',
          rateLimitInfo: {},
        };
      }
      throw new Error(`Unexpected model: ${model}`);
    });

    const result = await executeCronFetchAndScore(
      mockSupabase,
      OWNER_UID,
      Date.now(),
      fastSleep
    );

    expect(result.scored).toBe(1);
    expect(result.stoppedReason).toBe('done');

    const jobUpdate = executedUpdates.find((u) => u.table === 'jobs');
    expect(jobUpdate).toBeDefined();
    expect(jobUpdate.data.scored_model).toBe('fallback-model-20b');
    expect(jobUpdate.data.fit_score).toBe(88);
  });

  it('stops cleanly with stopped_reason = "rate_limit" when both primary and fallback fail with 429', async () => {
    const mockSupabase: any = {
      from: vi.fn((table: string) => {
        const builder: any = {
          select: () => builder,
          insert: () => builder,
          update: () => builder,
          eq: () => builder,
          gte: () => builder,
          gt: () => builder,
          in: () => builder,
          order: () => builder,
          limit: () => builder,
          maybeSingle: async () => {
            if (table === 'profiles') {
              return {
                data: {
                  resume_text: 'Experienced Product Manager',
                  total_years_experience: 5,
                  pm_years_experience: 4,
                  target_roles: ['Product Manager'],
                },
                error: null,
              };
            }
            return { data: null, error: null };
          },
          then: (resolve: any) => {
            if (table === 'companies' || table === 'search_queries' || table === 'cron_runs') {
              return resolve({ data: [], error: null });
            }
            if (table === 'jobs') {
              return resolve({
                data: [
                  {
                    id: 'job-1',
                    title: 'Product Manager',
                    company_name: 'TechCo',
                    location: 'Bangalore, India',
                    description: 'Description...',
                  },
                ],
                count: 0,
                error: null,
              });
            }
            return resolve({ data: [], error: null });
          },
        };
        return builder;
      }),
    };

    // Both models throw 429
    vi.spyOn(groqClient, 'requestGroqFitScore').mockImplementation(async () => {
      const err: any = new Error('Rate limit exceeded');
      err.status = 429;
      err.retryAfterSeconds = 50;
      throw err;
    });

    const result = await executeCronFetchAndScore(
      mockSupabase,
      OWNER_UID,
      Date.now(),
      fastSleep
    );

    expect(result.stoppedReason).toBe('rate_limit');
    expect(result.scored).toBe(0);
    expect(result.errors.some((e) => e.includes('rate-limited'))).toBe(true);
  });
});
