import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCronFetchAndScore } from '../runner';
import * as groqClient from '@/lib/groq/client';

describe('Multi-User Cron Runner Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('interleaves round-robin scoring across multiple users and logs a cron_run per user', async () => {
    const userA = 'user-alice-111';
    const userB = 'user-bob-222';

    const jobsA = [
      { id: 'job-a1', title: 'Product Manager', company_name: 'Alpha', location: 'Bengaluru, IN', description: 'Desc A1' },
      { id: 'job-a2', title: 'APM', company_name: 'Alpha', location: 'Bengaluru, IN', description: 'Desc A2' },
    ];
    const jobsB = [
      { id: 'job-b1', title: 'Product Owner', company_name: 'Beta', location: 'Remote', description: 'Desc B1' },
      { id: 'job-b2', title: 'Product Analyst', company_name: 'Beta', location: 'Mumbai', description: 'Desc B2' },
    ];

    const executedScoreCalls: string[] = [];
    vi.spyOn(groqClient, 'requestGroqFitScore').mockImplementation(async (_sys, userMsg) => {
      if (userMsg.includes('Alpha')) {
        executedScoreCalls.push('Alpha');
      } else if (userMsg.includes('Beta')) {
        executedScoreCalls.push('Beta');
      }
      return {
        data: {
          fit_score: 85,
          top_reasons: ['Strong PM skills'],
          gaps: [],
          recommended_resume_bullets_to_lead_with: ['Led key initiatives'],
          seniority_match: 'fit',
        },
        modelUsed: 'llama-3.3-70b-versatile',
      };
    });

    const cronRunsInserted: any[] = [];
    const jobUpdates: Array<{ id: string; userId: string }> = [];

    const mockSupabase: any = {
      auth: {
        admin: {
          listUsers: async () => ({
            data: {
              users: [
                { id: userA, email: 'alice@example.com' },
                { id: userB, email: 'bob@example.com' },
              ],
            },
            error: null,
          }),
        },
      },
      from: vi.fn((table: string) => {
        let currentUserId: string | null = null;
        let currentJobId: string | null = null;

        const builder: any = {
          select: () => builder,
          insert: (data: any) => {
            if (table === 'cron_runs') {
              cronRunsInserted.push(data);
            }
            return builder;
          },
          update: (payload: any) => {
            return {
              eq: (col: string, val: any) => {
                if (col === 'id') currentJobId = val;
                if (col === 'user_id') currentUserId = val;
                return {
                  eq: (col2: string, val2: any) => {
                    if (col2 === 'id') currentJobId = val2;
                    if (col2 === 'user_id') currentUserId = val2;
                    if (table === 'jobs' && currentJobId && currentUserId) {
                      jobUpdates.push({ id: currentJobId, userId: currentUserId });
                    }
                    return { error: null };
                  },
                };
              },
            };
          },
          eq: (col: string, val: any) => {
            if (col === 'user_id') currentUserId = val;
            return builder;
          },
          gte: () => builder,
          gt: () => builder,
          in: () => builder,
          order: () => builder,
          limit: () => builder,
          maybeSingle: async () => {
            if (table === 'profiles') {
              return {
                data: {
                  resume_text: `Led key initiatives at PM startup for user ${currentUserId}`,
                  total_years_experience: 5,
                  pm_years_experience: 3,
                  target_roles: ['PM'],
                },
                error: null,
              };
            }
            if (table === 'user_filters') {
              return {
                data: {
                  include_titles: ['Product Manager', 'APM', 'Product Owner', 'Product Analyst'],
                  exclude_titles: ['Director'],
                  allowed_locations: ['India', 'Bengaluru', 'Mumbai'],
                  allow_remote: true,
                },
                error: null,
              };
            }
            if (table === 'cron_runs') {
              return { data: { id: `run-${currentUserId}` }, error: null };
            }
            return { data: null, error: null };
          },
          then: (resolve: any) => {
            if (table === 'companies' || table === 'search_queries' || table === 'cron_runs') {
              return resolve({ data: [], error: null });
            }
            if (table === 'jobs') {
              if (currentUserId === userA) {
                return resolve({ data: jobsA, count: 0, error: null });
              } else if (currentUserId === userB) {
                return resolve({ data: jobsB, count: 0, error: null });
              }
              return resolve({ data: [], count: 0, error: null });
            }
            return resolve({ data: [], error: null });
          },
        };
        return builder;
      }),
    };

    process.env.ALLOWED_EMAILS = 'alice@example.com, bob@example.com';
    await executeCronFetchAndScore(mockSupabase);

    // Verify round-robin scoring order: Alpha (A), Beta (B), Alpha (A), Beta (B)
    expect(executedScoreCalls).toEqual(['Alpha', 'Beta', 'Alpha', 'Beta']);

    // Verify two cron_runs rows recorded (one for Alice, one for Bob)
    expect(cronRunsInserted.length).toBe(2);
    expect(cronRunsInserted.map((r) => r.user_id)).toEqual(
      expect.arrayContaining([userA, userB])
    );
    expect(cronRunsInserted.every((r) => r.scored === 2)).toBe(true);

    // Verify updates were explicitly scoped to respective user IDs
    expect(jobUpdates.filter((u) => u.userId === userA).length).toBe(2);
    expect(jobUpdates.filter((u) => u.userId === userB).length).toBe(2);
  });
});
