import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCronFetchAndScore } from '../runner';
import * as groqClient from '@/lib/groq/client';

describe('Cron Runner Safety & Execution Logic', () => {
  const OWNER_UID = 'user-owner-12345';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('strictly enforces user_id scoping on every single database operation', async () => {
    const executedOperations: Array<{
      table: string;
      operation: 'select' | 'insert' | 'update' | 'delete';
      eqFilters: Array<{ column: string; value: any }>;
      insertPayload?: any;
    }> = [];

    // Helper to construct chainable mock Supabase builder tracking filters
    const createMockBuilder = (table: string) => {
      const eqFilters: Array<{ column: string; value: any }> = [];
      let currentOp: 'select' | 'insert' | 'update' | 'delete' = 'select';
      let payload: any = undefined;

      const builder: any = {
        select: vi.fn(() => {
          if (currentOp !== 'insert' && currentOp !== 'update') {
            currentOp = 'select';
          }
          return builder;
        }),
        insert: vi.fn((data: any) => {
          currentOp = 'insert';
          payload = data;
          return builder;
        }),
        update: vi.fn((data: any) => {
          currentOp = 'update';
          payload = data;
          return builder;
        }),
        delete: vi.fn(() => {
          currentOp = 'delete';
          return builder;
        }),
        eq: vi.fn((col: string, val: any) => {
          eqFilters.push({ column: col, value: val });
          return builder;
        }),
        gte: vi.fn(() => builder),
        in: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => {
          executedOperations.push({
            table,
            operation: currentOp,
            eqFilters: [...eqFilters],
            insertPayload: payload,
          });
          if (table === 'profiles') {
            return {
              data: {
                resume_text: 'Principal PM with 8 years of product leadership experience',
                total_years_experience: 8,
                pm_years_experience: 6,
                target_roles: ['Principal PM'],
              },
              error: null,
            };
          }
          if (table === 'cron_runs') {
            return { data: { id: 'mock-run-id-1' }, error: null };
          }
          return { data: null, error: null };
        }),
        then: (resolve: any) => {
          executedOperations.push({
            table,
            operation: currentOp,
            eqFilters: [...eqFilters],
            insertPayload: payload,
          });
          if (table === 'companies') {
            return resolve({ data: [], error: null });
          }
          if (table === 'jobs' && currentOp === 'select') {
            return resolve({ data: [], count: 0, error: null });
          }
          return resolve({ data: [], error: null });
        },
      };

      return builder;
    };

    const mockSupabase: any = {
      from: vi.fn((tableName: string) => createMockBuilder(tableName)),
    };

    const result = await executeCronFetchAndScore(mockSupabase, OWNER_UID);

    expect(result.userId).toBe(OWNER_UID);

    // Verify all queries targeted tables with explicit user_id filter or insert
    expect(executedOperations.length).toBeGreaterThanOrEqual(3);

    for (const op of executedOperations) {
      if (op.operation === 'insert') {
        const payload = Array.isArray(op.insertPayload)
          ? op.insertPayload[0]
          : op.insertPayload;
        expect(
          payload?.user_id,
          `Insert into table '${op.table}' must explicitly include user_id = OWNER_USER_ID`
        ).toBe(OWNER_UID);
      } else {
        const userIdFilter = op.eqFilters.find((f) => f.column === 'user_id');
        expect(
          userIdFilter,
          `Operation '${op.operation}' on table '${op.table}' MUST filter by .eq('user_id', OWNER_USER_ID)`
        ).toBeDefined();
        expect(userIdFilter?.value).toBe(OWNER_UID);
      }
    }
  });

  it('stops cleanly and marks stopped_reason as rate_limit when Groq returns HTTP 429', async () => {
    const executedInserts: any[] = [];

    const mockSupabase: any = {
      from: vi.fn((table: string) => {
        const builder: any = {
          select: () => builder,
          insert: (data: any) => {
            executedInserts.push({ table, data });
            return builder;
          },
          update: () => builder,
          eq: () => builder,
          gte: () => builder,
          in: () => builder,
          order: () => builder,
          limit: () => builder,
          maybeSingle: async () => {
            if (table === 'profiles') {
              return {
                data: {
                  resume_text: 'Experienced Lead PM in Fintech',
                  total_years_experience: 10,
                  pm_years_experience: 8,
                  target_roles: ['Lead PM'],
                },
                error: null,
              };
            }
            if (table === 'cron_runs') {
              return { data: { id: 'run-rate-limited' }, error: null };
            }
            return { data: null, error: null };
          },
          then: (resolve: any) => {
            if (table === 'companies') return resolve({ data: [], error: null });
            if (table === 'jobs') {
              return resolve({
                data: [
                  {
                    id: 'job-1',
                    title: 'Lead Product Manager',
                    company_name: 'TechCo',
                    location: 'Bangalore, India',
                    description: 'Looking for a PM...',
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

    // Mock Groq client throwing a 429 error
    vi.spyOn(groqClient, 'requestGroqFitScore').mockRejectedValueOnce(
      Object.assign(new Error('Rate limit exceeded'), { status: 429 })
    );

    const result = await executeCronFetchAndScore(mockSupabase, OWNER_UID);

    expect(result.stoppedReason).toBe('rate_limit');
    expect(result.scored).toBe(0);

    // cron_runs must still be recorded
    const cronInsert = executedInserts.find((q) => q.table === 'cron_runs');
    expect(cronInsert).toBeDefined();
    expect(cronInsert.data.stopped_reason).toBe('rate_limit');
    expect(cronInsert.data.user_id).toBe(OWNER_UID);
  });

  it('stops cleanly and marks stopped_reason as time when time budget of 45s is reached', async () => {
    const executedInserts: any[] = [];

    const mockSupabase: any = {
      from: vi.fn((table: string) => {
        const builder: any = {
          select: () => builder,
          insert: (data: any) => {
            executedInserts.push({ table, data });
            return builder;
          },
          update: () => builder,
          eq: () => builder,
          gte: () => builder,
          in: () => builder,
          order: () => builder,
          limit: () => builder,
          maybeSingle: async () => {
            if (table === 'profiles') {
              return {
                data: {
                  resume_text: 'Experienced Lead PM in Fintech',
                  total_years_experience: 10,
                  pm_years_experience: 8,
                  target_roles: ['Lead PM'],
                },
                error: null,
              };
            }
            return { data: null, error: null };
          },
          then: (resolve: any) => {
            if (table === 'companies') return resolve({ data: [], error: null });
            if (table === 'jobs') {
              return resolve({
                data: [
                  {
                    id: 'job-1',
                    title: 'Lead PM',
                    company_name: 'TechCo',
                    location: 'Remote, India',
                    description: 'Description',
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

    // Simulate start time 46 seconds ago
    const simulatedStartTime = Date.now() - 46 * 1000;
    const result = await executeCronFetchAndScore(mockSupabase, OWNER_UID, simulatedStartTime);

    expect(result.stoppedReason).toBe('time');
    expect(result.scored).toBe(0);

    const cronInsert = executedInserts.find((q) => q.table === 'cron_runs');
    expect(cronInsert).toBeDefined();
    expect(cronInsert.data.stopped_reason).toBe('time');
  });

  it('always records a cron_runs row via try/finally even if a fatal exception is thrown', async () => {
    const executedInserts: any[] = [];

    const mockSupabase: any = {
      from: vi.fn((table: string) => {
        if (table === 'companies') {
          throw new Error('Database connection interrupted');
        }
        const builder: any = {
          insert: (data: any) => {
            executedInserts.push({ table, data });
            return builder;
          },
          select: () => builder,
          maybeSingle: async () => ({ data: { id: 'fatal-run-id' }, error: null }),
        };
        return builder;
      }),
    };

    const result = await executeCronFetchAndScore(mockSupabase, OWNER_UID);

    expect(result.status).toBe('failed');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Database connection interrupted');

    const cronInsert = executedInserts.find((q) => q.table === 'cron_runs');
    expect(cronInsert).toBeDefined();
    expect(cronInsert.data.status).toBe('failed');
    expect(cronInsert.data.user_id).toBe(OWNER_UID);
  });
});
