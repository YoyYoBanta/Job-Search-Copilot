import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getStartOfIstDay,
  getDailyScoreCap,
  calculateRemainingBudget,
  DEFAULT_AUTO_SCORE_DAILY_CAP,
} from '../budget';

describe('Cron Scoring Budget & IST Utilities', () => {
  const originalEnv = process.env.AUTO_SCORE_DAILY_CAP;

  afterEach(() => {
    process.env.AUTO_SCORE_DAILY_CAP = originalEnv;
  });

  describe('getStartOfIstDay', () => {
    it('calculates the exact UTC midnight boundary for an afternoon IST time', () => {
      // 2026-09-19T10:00:00.000Z is 15:30:00 IST on 2026-09-19
      const afternoonUtc = new Date('2026-09-19T10:00:00.000Z');
      const startOfDay = getStartOfIstDay(afternoonUtc);

      // IST 00:00:00 on 2026-09-19 is UTC 2026-09-18T18:30:00.000Z
      expect(startOfDay.toISOString()).toBe('2026-09-18T18:30:00.000Z');
    });

    it('calculates the boundary correctly for early morning IST (e.g. 01:00 IST)', () => {
      // 2026-09-18T19:30:00.000Z is 01:00:00 IST on 2026-09-19
      const earlyMorningUtc = new Date('2026-09-18T19:30:00.000Z');
      const startOfDay = getStartOfIstDay(earlyMorningUtc);

      expect(startOfDay.toISOString()).toBe('2026-09-18T18:30:00.000Z');
    });

    it('calculates the boundary correctly for late night IST (e.g. 23:59 IST)', () => {
      // 2026-09-19T18:29:00.000Z is 23:59:00 IST on 2026-09-19
      const lateNightUtc = new Date('2026-09-19T18:29:00.000Z');
      const startOfDay = getStartOfIstDay(lateNightUtc);

      expect(startOfDay.toISOString()).toBe('2026-09-18T18:30:00.000Z');
    });

    it('switches to the next day immediately at 00:00:01 IST', () => {
      // 2026-09-19T18:30:01.000Z is 00:00:01 IST on 2026-09-20
      const nextDayUtc = new Date('2026-09-19T18:30:01.000Z');
      const startOfDay = getStartOfIstDay(nextDayUtc);

      expect(startOfDay.toISOString()).toBe('2026-09-19T18:30:00.000Z');
    });
  });

  describe('getDailyScoreCap', () => {
    it('returns default 30 when AUTO_SCORE_DAILY_CAP is unset', () => {
      delete process.env.AUTO_SCORE_DAILY_CAP;
      expect(getDailyScoreCap()).toBe(DEFAULT_AUTO_SCORE_DAILY_CAP);
      expect(getDailyScoreCap()).toBe(30);
    });

    it('parses custom valid integer from AUTO_SCORE_DAILY_CAP', () => {
      process.env.AUTO_SCORE_DAILY_CAP = '50';
      expect(getDailyScoreCap()).toBe(50);
    });

    it('falls back to default 30 for invalid or negative strings', () => {
      process.env.AUTO_SCORE_DAILY_CAP = 'invalid';
      expect(getDailyScoreCap()).toBe(30);

      process.env.AUTO_SCORE_DAILY_CAP = '-10';
      expect(getDailyScoreCap()).toBe(30);
    });
  });

  describe('calculateRemainingBudget', () => {
    it('returns remaining budget when below cap', () => {
      expect(calculateRemainingBudget(30, 10)).toBe(20);
      expect(calculateRemainingBudget(30, 0)).toBe(30);
      expect(calculateRemainingBudget(50, 49)).toBe(1);
    });

    it('returns 0 when cap is reached or exceeded', () => {
      expect(calculateRemainingBudget(30, 30)).toBe(0);
      expect(calculateRemainingBudget(30, 35)).toBe(0);
    });

    it('handles negative scored count gracefully as 0', () => {
      expect(calculateRemainingBudget(30, -5)).toBe(30);
    });
  });

  describe('RapidAPI Monthly Cap & Usage', () => {
    const originalMonthlyCap = process.env.RAPIDAPI_MONTHLY_CAP;

    afterEach(() => {
      process.env.RAPIDAPI_MONTHLY_CAP = originalMonthlyCap;
    });

    it('returns default 190 when RAPIDAPI_MONTHLY_CAP is unset', async () => {
      const { getRapidApiMonthlyCap } = await import('../budget');
      delete process.env.RAPIDAPI_MONTHLY_CAP;
      expect(getRapidApiMonthlyCap()).toBe(190);
    });

    it('parses custom integer from RAPIDAPI_MONTHLY_CAP', async () => {
      const { getRapidApiMonthlyCap } = await import('../budget');
      process.env.RAPIDAPI_MONTHLY_CAP = '250';
      expect(getRapidApiMonthlyCap()).toBe(250);
    });

    it('sums search_calls across all users for current calendar month', async () => {
      const { getRapidApiMonthlyUsage, isRapidApiMonthlyCapReached } = await import('../budget');
      process.env.RAPIDAPI_MONTHLY_CAP = '190';

      const mockSupabase: any = {
        from: (table: string) => ({
          select: () => ({
            gte: () => ({
              data: [{ search_calls: 100 }, { search_calls: 95 }],
              error: null,
            }),
          }),
        }),
      };

      const usage = await getRapidApiMonthlyUsage(mockSupabase);
      expect(usage).toBe(195);

      const status = await isRapidApiMonthlyCapReached(mockSupabase);
      expect(status.reached).toBe(true);
      expect(status.usage).toBe(195);
      expect(status.cap).toBe(190);
    });
  });
});
