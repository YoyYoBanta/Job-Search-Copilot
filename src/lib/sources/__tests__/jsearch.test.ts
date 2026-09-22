import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  formatJSearchLocation,
  extractApplyOptions,
  JSearchRawJob,
} from '../jsearch';

describe('JSearch Parser & Apply Option Utilities', () => {
  describe('formatJSearchLocation', () => {
    it('formats remote India locations with city', () => {
      const loc = formatJSearchLocation({
        city: 'Bengaluru',
        country: 'IN',
        isRemote: true,
      });
      expect(loc).toBe('Bengaluru, India (Remote)');
    });

    it('formats generic remote India locations', () => {
      const loc = formatJSearchLocation({
        country: 'IN',
        isRemote: true,
      });
      expect(loc).toBe('Remote, India');
    });

    it('formats on-site India locations with city', () => {
      const loc = formatJSearchLocation({
        city: 'Mumbai',
        country: 'IN',
        isRemote: false,
      });
      expect(loc).toBe('Mumbai, India');
    });

    it('formats pure remote when country is unspecified', () => {
      const loc = formatJSearchLocation({
        isRemote: true,
      });
      expect(loc).toBe('Remote');
    });
  });

  describe('extractApplyOptions', () => {
    it('preserves direct apply links and extracts multiple publishers', () => {
      const rawJob: JSearchRawJob = {
        job_id: 'j-1',
        job_title: 'Product Manager',
        employer_name: 'TechCo',
        job_apply_link: 'https://techco.com/careers/pm',
        job_apply_is_direct: true,
        apply_options: [
          {
            publisher: 'TechCo Careers',
            apply_link: 'https://techco.com/careers/pm',
            is_direct: true,
          },
          {
            publisher: 'LinkedIn',
            apply_link: 'https://linkedin.com/jobs/view/12345',
            is_direct: false,
          },
          {
            publisher: 'Naukri',
            apply_link: 'https://naukri.com/job/67890',
            is_direct: false,
          },
        ],
      };

      const options = extractApplyOptions(rawJob);
      expect(options.length).toBe(3);

      const direct = options.find((o) => o.is_direct);
      expect(direct).toBeDefined();
      expect(direct?.publisher).toBe('TechCo Careers');
      expect(direct?.apply_link).toBe('https://techco.com/careers/pm');

      expect(options.map((o) => o.publisher)).toEqual(['TechCo Careers', 'LinkedIn', 'Naukri']);
    });

    it('falls back to job_apply_link if apply_options array is empty', () => {
      const rawJob: JSearchRawJob = {
        job_id: 'j-2',
        job_title: 'APM',
        employer_name: 'FinCo',
        job_apply_link: 'https://finco.com/apply',
        job_apply_is_direct: true,
      };

      const options = extractApplyOptions(rawJob);
      expect(options.length).toBe(1);
      expect(options[0].apply_link).toBe('https://finco.com/apply');
      expect(options[0].is_direct).toBe(true);
    });
  });

  describe('fetchJSearchRawJobs', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv, RAPIDAPI_KEY: 'test-rapidapi-key' };
    });

    afterEach(() => {
      process.env = originalEnv;
      vi.restoreAllMocks();
    });

    it('throws error if RAPIDAPI_KEY is not set', async () => {
      delete process.env.RAPIDAPI_KEY;
      const { fetchJSearchRawJobs } = await import('../jsearch');
      await expect(
        fetchJSearchRawJobs({ query: 'Product Manager' })
      ).rejects.toThrow('Missing RAPIDAPI_KEY');
    });

    it('makes request to configured endpoint with correct headers and query parameters', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ job_id: '123', job_title: 'PM' }] }),
      });
      global.fetch = mockFetch;

      const { fetchJSearchRawJobs } = await import('../jsearch');
      const jobs = await fetchJSearchRawJobs({
        query: 'Associate Product Manager',
        country: 'in',
        datePosted: 'week',
        numPages: 1,
      });

      expect(jobs.length).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [calledUrl, calledInit] = mockFetch.mock.calls[0];
      const url = new URL(calledUrl);
      expect(url.origin + url.pathname).toBe('https://jsearch.p.rapidapi.com/search');
      expect(url.searchParams.get('query')).toBe('Associate Product Manager');
      expect(url.searchParams.get('country')).toBe('in');
      expect(url.searchParams.get('date_posted')).toBe('week');
      expect(url.searchParams.get('num_pages')).toBe('1');
      expect(calledInit.headers['x-rapidapi-key']).toBe('test-rapidapi-key');
      expect(calledInit.headers['x-rapidapi-host']).toBe('jsearch.p.rapidapi.com');
    });

    it('supports custom RAPIDAPI_JSEARCH_URL and RAPIDAPI_HOST env variables', async () => {
      process.env.RAPIDAPI_JSEARCH_URL = 'https://custom-jsearch.p.rapidapi.com/v5/search';
      process.env.RAPIDAPI_HOST = 'custom-jsearch.p.rapidapi.com';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      });
      global.fetch = mockFetch;

      const { fetchJSearchRawJobs } = await import('../jsearch');
      await fetchJSearchRawJobs({ query: 'Tech PM' });

      const [calledUrl, calledInit] = mockFetch.mock.calls[0];
      const url = new URL(calledUrl);
      expect(url.origin + url.pathname).toBe('https://custom-jsearch.p.rapidapi.com/v5/search');
      expect(calledInit.headers['x-rapidapi-host']).toBe('custom-jsearch.p.rapidapi.com');
    });

    it('throws descriptive error on 404 or non-200 responses', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ message: "Endpoint '/search' does not exist" }),
      });
      global.fetch = mockFetch;

      const { fetchJSearchRawJobs } = await import('../jsearch');
      await expect(
        fetchJSearchRawJobs({ query: 'Tech PM' })
      ).rejects.toThrow("RapidAPI JSearch error (HTTP 404): {\"message\":\"Endpoint '/search' does not exist\"}");
    });
  });
});
