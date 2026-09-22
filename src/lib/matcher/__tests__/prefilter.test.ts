import { describe, it, expect } from 'vitest';
import { evaluateScoringPreFilter } from '../prefilter';

describe('Ingestion Pre-Filtering (evaluateScoringPreFilter)', () => {
  const referenceDate = new Date('2026-09-22T12:00:00.000Z');

  it('passes for target APM/PM roles with low experience and recent posting date', () => {
    const result = evaluateScoringPreFilter(
      {
        title: 'Associate Product Manager',
        description: 'Looking for a passionate APM with 1-3 years experience in building mobile products.',
        postedAt: '2026-09-20T10:00:00.000Z', // 2 days old
        requiredExperienceYears: 2,
      },
      referenceDate
    );

    expect(result.passed).toBe(true);
  });

  it('rejects candidates with requiredExperienceYears >= 6', () => {
    const result = evaluateScoringPreFilter(
      {
        title: 'Product Manager',
        description: 'Lead consumer initiatives',
        postedAt: '2026-09-20T10:00:00.000Z',
        requiredExperienceYears: 7,
      },
      referenceDate
    );

    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Required experience is 7 years');
  });

  it('rejects candidates when description mentions 6+ years of experience', () => {
    const result = evaluateScoringPreFilter(
      {
        title: 'Product Manager',
        description: 'Candidate must possess 8+ years of experience in enterprise B2B SaaS product management.',
        postedAt: '2026-09-20T10:00:00.000Z',
      },
      referenceDate
    );

    expect(result.passed).toBe(false);
    expect(result.reason).toContain('6+ years of experience');
  });

  it('rejects candidates with blocked seniority level metadata', () => {
    const seniorResult = evaluateScoringPreFilter(
      {
        title: 'Product Manager',
        seniorityLevel: 'director',
        postedAt: '2026-09-20T10:00:00.000Z',
      },
      referenceDate
    );
    expect(seniorResult.passed).toBe(false);
    expect(seniorResult.reason).toContain('director');

    const leadResult = evaluateScoringPreFilter(
      {
        title: 'Product Manager',
        seniorityLevel: 'lead',
        postedAt: '2026-09-20T10:00:00.000Z',
      },
      referenceDate
    );
    expect(leadResult.passed).toBe(false);
  });

  it('rejects candidates with senior keywords in title', () => {
    const titles = [
      'Senior Product Manager',
      'Lead Product Manager',
      'VP of Product',
      'Director of Product Management',
      'Principal PM',
      'Staff Product Manager',
      'Head of Product',
    ];

    for (const title of titles) {
      const result = evaluateScoringPreFilter(
        {
          title,
          postedAt: '2026-09-20T10:00:00.000Z',
        },
        referenceDate
      );
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('senior');
    }
  });

  it('rejects jobs older than 21 days', () => {
    // 25 days old
    const oldDate = new Date('2026-08-28T12:00:00.000Z').toISOString();
    const result = evaluateScoringPreFilter(
      {
        title: 'Associate Product Manager',
        description: 'Great opportunity',
        postedAt: oldDate,
      },
      referenceDate
    );

    expect(result.passed).toBe(false);
    expect(result.reason).toContain('more than 21 days ago');
  });

  it('handles unix timestamps (seconds vs milliseconds) accurately for 21-day cutoff', () => {
    // 5 days ago in epoch seconds
    const fiveDaysAgoSec = Math.floor(new Date('2026-09-17T12:00:00.000Z').getTime() / 1000);
    const recentResult = evaluateScoringPreFilter(
      {
        title: 'Product Manager',
        postedAt: fiveDaysAgoSec,
      },
      referenceDate
    );
    expect(recentResult.passed).toBe(true);

    // 30 days ago in epoch seconds
    const thirtyDaysAgoSec = Math.floor(new Date('2026-08-20T12:00:00.000Z').getTime() / 1000);
    const expiredResult = evaluateScoringPreFilter(
      {
        title: 'Product Manager',
        postedAt: thirtyDaysAgoSec,
      },
      referenceDate
    );
    expect(expiredResult.passed).toBe(false);
  });
});
