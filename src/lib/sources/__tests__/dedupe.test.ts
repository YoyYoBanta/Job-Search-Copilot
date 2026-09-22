import { describe, it, expect } from 'vitest';
import {
  normalizeCompanyName,
  normalizeJobTitle,
  isJobDuplicate,
  ExistingJobDedupeRecord,
} from '../dedupe';

describe('Cross-Source Deduplication (dedupe.ts)', () => {
  const referenceDate = new Date('2026-09-22T12:00:00.000Z');

  describe('normalizeCompanyName', () => {
    it('normalizes Razorpay Software Pvt Ltd to match Razorpay', () => {
      const a = normalizeCompanyName('Razorpay');
      const b = normalizeCompanyName('Razorpay Software Pvt Ltd');
      expect(a).toBe('razorpay');
      expect(b).toBe('razorpay');
      expect(a).toBe(b);
    });

    it('normalizes various legal suffixes and punctuation', () => {
      expect(normalizeCompanyName('CRED Technologies India Pvt. Ltd.')).toBe('cred');
      expect(normalizeCompanyName('PhonePe Internet Private Limited')).toBe('phonepe internet');
      expect(normalizeCompanyName('Urban Company Co.')).toBe('urban company');
      expect(normalizeCompanyName('Groww (Nextbillion Technology Labs)')).toBe('groww nextbillion');
    });
  });

  describe('normalizeJobTitle', () => {
    it('normalizes location and remote tags from titles', () => {
      const a = normalizeJobTitle('Associate Product Manager - Remote (India)');
      const b = normalizeJobTitle('Associate Product Manager, Bengaluru');
      const c = normalizeJobTitle('Associate Product Manager');

      expect(a).toBe('associate product manager');
      expect(b).toBe('associate product manager');
      expect(c).toBe('associate product manager');
    });
  });

  describe('isJobDuplicate', () => {
    const existingJobs: ExistingJobDedupeRecord[] = [
      {
        id: 'job-1',
        job_url: 'https://boards.greenhouse.io/razorpay/jobs/12345',
        external_id: 'jsearch-abc-111',
        company_name: 'Razorpay Software Pvt Ltd',
        title: 'Associate Product Manager',
        created_at: '2026-09-18T10:00:00.000Z', // 4 days ago
      },
      {
        id: 'job-2',
        job_url: 'https://jobs.lever.co/cred/67890',
        external_id: 'jsearch-cred-222',
        company_name: 'CRED',
        title: 'Product Manager',
        created_at: '2026-08-01T10:00:00.000Z', // > 50 days ago (outside 14-day window)
      },
    ];

    it('detects duplicate by exact URL', () => {
      const result = isJobDuplicate(
        {
          job_url: 'https://boards.greenhouse.io/razorpay/jobs/12345',
          company_name: 'Different Name',
          title: 'Different Title',
        },
        existingJobs,
        referenceDate
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.reason).toContain('Duplicate job URL');
    });

    it('detects duplicate by external_id (JSearch job_id)', () => {
      const result = isJobDuplicate(
        {
          job_url: 'https://linkedin.com/jobs/view/999999',
          external_id: 'jsearch-abc-111',
          company_name: 'Different Name',
          title: 'Different Title',
        },
        existingJobs,
        referenceDate
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.reason).toContain('Duplicate external_id');
    });

    it('detects cross-source duplicate with same normalized company + title within 14 days', () => {
      const result = isJobDuplicate(
        {
          job_url: 'https://naukri.com/job-listings/apm-razorpay-8888',
          external_id: 'jsearch-new-unique-id',
          company_name: 'Razorpay', // Matches "Razorpay Software Pvt Ltd"
          title: 'Associate Product Manager - Bengaluru', // Matches "Associate Product Manager"
        },
        existingJobs,
        referenceDate
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.reason).toContain('Cross-source duplicate');
    });

    it('allows same company + title if older than 14 days', () => {
      const result = isJobDuplicate(
        {
          job_url: 'https://naukri.com/job-listings/pm-cred-new-listing',
          external_id: 'jsearch-cred-333',
          company_name: 'CRED Technologies India Pvt Ltd',
          title: 'Product Manager',
        },
        existingJobs,
        referenceDate
      );

      expect(result.isDuplicate).toBe(false);
    });
  });
});
