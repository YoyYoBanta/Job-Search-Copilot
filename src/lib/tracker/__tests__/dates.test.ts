import { describe, it, expect } from 'vitest';
import {
  getDateStringIST,
  getTodayIST,
  addDaysToDateString,
  getDaysAgoIST,
  getDaysAheadIST,
  isFollowUpDue,
  isAppliedThisWeek,
} from '../dates';

describe('Timezone & Date Utilities (Asia/Kolkata)', () => {
  it('correctly maps UTC timestamps to Asia/Kolkata date (e.g. 01:00 IST)', () => {
    // 01:00 IST on 2026-09-19 is 2026-09-18 19:30:00 UTC
    const dateAt1amIST = new Date('2026-09-18T19:30:00.000Z');
    const istDateStr = getDateStringIST(dateAt1amIST);
    expect(istDateStr).toBe('2026-09-19');

    // 23:30 IST on 2026-09-19 is 2026-09-19 18:00:00 UTC
    const dateAt1130pmIST = new Date('2026-09-19T18:00:00.000Z');
    expect(getDateStringIST(dateAt1130pmIST)).toBe('2026-09-19');
  });

  it('evaluates follow-up due at 01:00 IST: today is due, tomorrow is not', () => {
    // Current time: 2026-09-19 01:00 IST (19:30 UTC previous day)
    const mockNow = new Date('2026-09-18T19:30:00.000Z');
    const todayIST = getDateStringIST(mockNow); // '2026-09-19'
    const tomorrowIST = addDaysToDateString(todayIST, 1); // '2026-09-20'
    const yesterdayIST = addDaysToDateString(todayIST, -1); // '2026-09-18'

    // Application with follow-up date = today (IST)
    const appDueToday = {
      stage: 'applied',
      next_follow_up_date: todayIST,
    };
    expect(isFollowUpDue(appDueToday, todayIST)).toBe(true);

    // Application with follow-up date = yesterday (IST)
    const appOverdue = {
      stage: 'applied',
      next_follow_up_date: yesterdayIST,
    };
    expect(isFollowUpDue(appOverdue, todayIST)).toBe(true);

    // Application with follow-up date = tomorrow (IST)
    const appDueTomorrow = {
      stage: 'applied',
      next_follow_up_date: tomorrowIST,
    };
    expect(isFollowUpDue(appDueTomorrow, todayIST)).toBe(false);
  });

  it('triggers 7-day follow-up rule for applied stage with no custom date set', () => {
    const todayIST = '2026-09-19';

    // Applied 8 days ago (2026-09-11) -> DUE
    const appApplied8DaysAgo = {
      stage: 'applied',
      applied_date: '2026-09-11',
      next_follow_up_date: null,
    };
    expect(isFollowUpDue(appApplied8DaysAgo, todayIST)).toBe(true);

    // Applied 7 days ago (2026-09-12) -> DUE
    const appApplied7DaysAgo = {
      stage: 'applied',
      applied_date: '2026-09-12',
      next_follow_up_date: null,
    };
    expect(isFollowUpDue(appApplied7DaysAgo, todayIST)).toBe(true);

    // Applied 3 days ago (2026-09-16) -> NOT due yet
    const appApplied3DaysAgo = {
      stage: 'applied',
      applied_date: '2026-09-16',
      next_follow_up_date: null,
    };
    expect(isFollowUpDue(appApplied3DaysAgo, todayIST)).toBe(false);
  });

  it('does not flag inactive/terminal stages as due for follow-up', () => {
    const todayIST = '2026-09-19';
    const overdue = '2026-09-10';

    expect(isFollowUpDue({ stage: 'saved', next_follow_up_date: overdue }, todayIST)).toBe(false);
    expect(isFollowUpDue({ stage: 'offer', next_follow_up_date: overdue }, todayIST)).toBe(false);
    expect(isFollowUpDue({ stage: 'rejected', next_follow_up_date: overdue }, todayIST)).toBe(false);
    expect(isFollowUpDue({ stage: 'withdrawn', next_follow_up_date: overdue }, todayIST)).toBe(false);
  });

  it('checks isAppliedThisWeek against Asia/Kolkata boundary', () => {
    const todayIST = '2026-09-19';

    expect(isAppliedThisWeek('2026-09-19', todayIST)).toBe(true);
    expect(isAppliedThisWeek('2026-09-14', todayIST)).toBe(true);
    expect(isAppliedThisWeek('2026-09-12', todayIST)).toBe(true); // 7 days ago
    expect(isAppliedThisWeek('2026-09-10', todayIST)).toBe(false); // 9 days ago
    expect(isAppliedThisWeek('2026-09-21', todayIST)).toBe(false); // future date
  });

  it('calculates getDaysAheadIST correctly relative to IST date', () => {
    const todayIST = '2026-09-19';
    expect(getDaysAheadIST(7, todayIST)).toBe('2026-09-26');
    expect(getDaysAheadIST(1, todayIST)).toBe('2026-09-20');
  });
});
