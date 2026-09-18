import { describe, it, expect } from 'vitest';
import {
  calculateTrackerMetrics,
  hasEverApplied,
  hasEverResponded,
  hasReferralConverted,
  ApplicationMetricsInput,
} from '../metrics';

describe('Tracker Metrics & Stage History Calculations', () => {
  it('counts a job that went applied -> interviewing -> rejected as a response', () => {
    const app: ApplicationMetricsInput = {
      id: 'app-1',
      stage: 'rejected',
      applied_date: '2026-09-10',
      stage_history: [
        { stage: 'saved', timestamp: '2026-09-08T10:00:00Z' },
        { stage: 'applied', timestamp: '2026-09-10T12:00:00Z' },
        { stage: 'interviewing', timestamp: '2026-09-14T15:00:00Z' },
        { stage: 'rejected', timestamp: '2026-09-18T18:00:00Z' },
      ],
    };

    expect(hasEverApplied(app)).toBe(true);
    expect(hasEverResponded(app)).toBe(true);

    const metrics = calculateTrackerMetrics([app], '2026-09-19');
    expect(metrics.totalEverAppliedCount).toBe(1);
    expect(metrics.totalEverRespondedCount).toBe(1);
    expect(metrics.responseRatePct).toBe(100);
  });

  it('calculates response rate across multiple applications correctly', () => {
    const apps: ApplicationMetricsInput[] = [
      // App 1: applied -> interviewing -> rejected (Responded)
      {
        id: 'app-1',
        stage: 'rejected',
        applied_date: '2026-09-10',
        stage_history: [
          { stage: 'applied', timestamp: '2026-09-10T10:00:00Z' },
          { stage: 'interviewing', timestamp: '2026-09-12T10:00:00Z' },
          { stage: 'rejected', timestamp: '2026-09-15T10:00:00Z' },
        ],
      },
      // App 2: applied -> offer (Responded)
      {
        id: 'app-2',
        stage: 'offer',
        applied_date: '2026-09-12',
        stage_history: [
          { stage: 'applied', timestamp: '2026-09-12T10:00:00Z' },
          { stage: 'interviewing', timestamp: '2026-09-15T10:00:00Z' },
          { stage: 'offer', timestamp: '2026-09-18T10:00:00Z' },
        ],
      },
      // App 3: applied -> rejected without interview (No response)
      {
        id: 'app-3',
        stage: 'rejected',
        applied_date: '2026-09-11',
        stage_history: [
          { stage: 'applied', timestamp: '2026-09-11T10:00:00Z' },
          { stage: 'rejected', timestamp: '2026-09-14T10:00:00Z' },
        ],
      },
      // App 4: applied (pending, no response yet)
      {
        id: 'app-4',
        stage: 'applied',
        applied_date: '2026-09-17',
        stage_history: [{ stage: 'applied', timestamp: '2026-09-17T10:00:00Z' }],
      },
      // App 5: saved only (not applied yet)
      {
        id: 'app-5',
        stage: 'saved',
        stage_history: [{ stage: 'saved', timestamp: '2026-09-16T10:00:00Z' }],
      },
    ];

    const metrics = calculateTrackerMetrics(apps, '2026-09-19');
    expect(metrics.totalTrackedCount).toBe(5);
    expect(metrics.totalEverAppliedCount).toBe(4); // apps 1, 2, 3, 4
    expect(metrics.totalEverRespondedCount).toBe(2); // apps 1, 2
    expect(metrics.responseRatePct).toBe(50); // 2 / 4 = 50%
    expect(metrics.activePipelineCount).toBe(1); // App 4 is currently 'applied'
  });

  it('calculates referral conversion from stage history', () => {
    const apps: ApplicationMetricsInput[] = [
      // Referral asked -> Applied (Converted)
      {
        id: 'ref-1',
        stage: 'applied',
        channel: 'referral',
        stage_history: [
          { stage: 'saved', timestamp: '2026-09-01T10:00:00Z' },
          { stage: 'referral_asked', timestamp: '2026-09-03T10:00:00Z' },
          { stage: 'applied', timestamp: '2026-09-08T10:00:00Z' },
        ],
      },
      // Referral asked -> Ghosted / Withdrawn without applying (Not converted)
      {
        id: 'ref-2',
        stage: 'withdrawn',
        channel: 'referral',
        stage_history: [
          { stage: 'referral_asked', timestamp: '2026-09-05T10:00:00Z' },
          { stage: 'withdrawn', timestamp: '2026-09-15T10:00:00Z' },
        ],
      },
    ];

    expect(hasReferralConverted(apps[0])).toBe(true);
    expect(hasReferralConverted(apps[1])).toBe(false);

    const metrics = calculateTrackerMetrics(apps, '2026-09-19');
    expect(metrics.totalEverReferralAskedCount).toBe(2);
    expect(metrics.totalReferralConvertedCount).toBe(1);
    expect(metrics.referralConversionRatePct).toBe(50);
  });
});
