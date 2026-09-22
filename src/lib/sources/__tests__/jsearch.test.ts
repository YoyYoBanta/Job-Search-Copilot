import { describe, it, expect } from 'vitest';
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
});
