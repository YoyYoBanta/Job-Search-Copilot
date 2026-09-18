import { describe, it, expect } from 'vitest';
import { filterNewCandidateJobs } from '../fetcher';

describe('Job Ingestion URL Deduplication & Dismissal Tests', () => {
  it('skips a dismissed job URL on re-fetch so it is never re-inserted', () => {
    // Scenario: User had imported job-123 and previously dismissed/soft-deleted it.
    // The database retains the row with dismissed = true.
    const existingUrlsInDatabase = [
      'https://boards.greenhouse.io/figma/jobs/12345', // dismissed job in DB
      'https://boards.greenhouse.io/figma/jobs/67890', // active job in DB
    ];

    const newlyFetchedCandidateJobs = [
      {
        url: 'https://boards.greenhouse.io/figma/jobs/12345', // dismissed job re-encountered in feed
        title: 'Product Manager',
      },
      {
        url: 'https://boards.greenhouse.io/figma/jobs/99999', // brand new job opening
        title: 'Associate Product Manager',
      },
    ];

    const result = filterNewCandidateJobs(newlyFetchedCandidateJobs, existingUrlsInDatabase);

    // Only the brand new job should be selected for insertion
    expect(result.newJobs).toHaveLength(1);
    expect(result.newJobs[0].url).toBe('https://boards.greenhouse.io/figma/jobs/99999');
    expect(result.duplicatesCount).toBe(1);
  });

  it('skips all jobs if all feed items already exist in the database (active or dismissed)', () => {
    const existingUrlsInDatabase = [
      'https://jobs.lever.co/company/job-1',
      'https://jobs.lever.co/company/job-2',
    ];

    const candidateJobs = [
      { url: 'https://jobs.lever.co/company/job-1', title: 'Product Manager' },
      { url: 'https://jobs.lever.co/company/job-2', title: 'APM' },
    ];

    const result = filterNewCandidateJobs(candidateJobs, existingUrlsInDatabase);
    expect(result.newJobs).toHaveLength(0);
    expect(result.duplicatesCount).toBe(2);
  });

  it('inserts all candidates when database has no matching URLs', () => {
    const existingUrlsInDatabase: string[] = [];

    const candidateJobs = [
      { url: 'https://jobs.ashbyhq.com/org/job-a', title: 'Product Owner' },
      { url: 'https://jobs.ashbyhq.com/org/job-b', title: 'Product Analyst' },
    ];

    const result = filterNewCandidateJobs(candidateJobs, existingUrlsInDatabase);
    expect(result.newJobs).toHaveLength(2);
    expect(result.duplicatesCount).toBe(0);
  });
});
