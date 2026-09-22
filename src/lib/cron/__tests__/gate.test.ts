import { describe, it, expect, vi } from 'vitest';
import { isJSearchEligibleToday, getIstHour } from '../budget';

describe('JSearch Daily Execution Gate (isJSearchEligibleToday)', () => {
  const OWNER_UID = 'user-owner-12345';

  it('correctly extracts IST hour across UTC dates', () => {
    // 00:30 UTC = 06:00 IST (6 AM)
    const sixAmIst = new Date('2026-09-22T00:30:00.000Z');
    expect(getIstHour(sixAmIst)).toBe(6);

    // 23:30 UTC (previous day) = 05:00 IST (5 AM)
    const fiveAmIst = new Date('2026-09-21T23:30:00.000Z');
    expect(getIstHour(fiveAmIst)).toBe(5);

    // 12:00 UTC = 17:30 IST (5 PM)
    const afternoonIst = new Date('2026-09-22T12:00:00.000Z');
    expect(getIstHour(afternoonIst)).toBe(17);
  });

  it('rejects execution when IST time is before 6:00 AM', async () => {
    // 04:30 IST (23:00 UTC previous day)
    const earlyTime = new Date('2026-09-21T23:00:00.000Z');
    const mockSupabase: any = {
      from: vi.fn(),
    };

    const result = await isJSearchEligibleToday(mockSupabase, OWNER_UID, earlyTime);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('before 6:00 AM IST');
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('allows execution when time is >= 6:00 AM IST and no prior search runs today', async () => {
    // 07:00 IST (01:30 UTC)
    const validMorning = new Date('2026-09-22T01:30:00.000Z');

    const mockSupabase: any = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            gte: vi.fn(() => ({
              gt: vi.fn(() => ({
                limit: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          })),
        })),
      })),
    };

    const result = await isJSearchEligibleToday(mockSupabase, OWNER_UID, validMorning);
    expect(result.eligible).toBe(true);
  });

  it('rejects execution if a previous run today already executed JSearch', async () => {
    // 12:00 IST (06:30 UTC)
    const validAfternoon = new Date('2026-09-22T06:30:00.000Z');

    const mockSupabase: any = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            gte: vi.fn(() => ({
              gt: vi.fn(() => ({
                limit: vi.fn(async () => ({
                  data: [{ id: 'run-earlier-today', search_calls: 3 }],
                  error: null,
                })),
              })),
            })),
          })),
        })),
      })),
    };

    const result = await isJSearchEligibleToday(mockSupabase, OWNER_UID, validAfternoon);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('already executed once today');
  });
});
