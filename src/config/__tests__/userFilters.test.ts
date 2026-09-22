import { describe, it, expect } from 'vitest';
import {
  evaluateJobFilter,
  evaluateTitle,
  evaluateLocation,
  DEFAULT_INCLUDE_TITLES,
  DEFAULT_EXCLUDE_TITLES,
  DEFAULT_ALLOWED_LOCATIONS,
  DEFAULT_ALLOW_REMOTE,
  UserFiltersConfig,
} from '../filters';

describe('Dynamic User Filters vs Static Filters Equivalence', () => {
  const defaultUserFiltersConfig: UserFiltersConfig = {
    include_titles: [...DEFAULT_INCLUDE_TITLES],
    exclude_titles: [...DEFAULT_EXCLUDE_TITLES],
    allowed_locations: [...DEFAULT_ALLOWED_LOCATIONS],
    allow_remote: DEFAULT_ALLOW_REMOTE,
  };

  const testCases: Array<{ title: string; location: string }> = [
    { title: 'Product Manager', location: 'Bengaluru, IN' },
    { title: 'Associate Product Manager', location: 'Bengaluru or Remote' },
    { title: 'Product Manager', location: 'New York City, Toronto, Chicago, or Remote' },
    { title: 'APM', location: 'Remote' },
    { title: 'Product Owner', location: 'Remote - Global' },
    { title: 'Senior Product Analyst', location: 'Remote (Worldwide)' },
    { title: 'Product Manager', location: 'Anywhere' },
    { title: 'Product Manager', location: 'Singapore' },
    { title: 'Product Manager', location: 'Hybrid in London' },
    { title: 'Product Manager', location: 'Remote - US' },
    { title: 'Associate Product', location: 'Hybrid - Gurugram' },
    { title: 'Product Manager', location: 'Remote - India' },
    { title: 'Product Analyst', location: 'Remote (EU only)' },
    { title: 'Product Manager', location: 'Berlin' },
    { title: 'Director of Product', location: 'Bengaluru, IN' },
    { title: 'VP of Product', location: 'Mumbai' },
    { title: 'Staff Product Manager', location: 'Pune' },
    { title: 'Group Product Manager', location: 'Delhi' },
    { title: 'Head of Product', location: 'Noida' },
    { title: 'Software Engineer', location: 'Bengaluru, IN' },
    { title: 'Product Manager, Mobile', location: 'San Francisco, CA; Seattle, WA' },
    { title: 'Lead Product Manager', location: 'Chennai' },
    { title: 'Principal Product Manager', location: 'Hyderabad' },
  ];

  it('produces 100% identical evaluation results between static defaults and dynamic user_filters config', () => {
    for (const { title, location } of testCases) {
      const staticResult = evaluateJobFilter(title, location);
      const dynamicResult = evaluateJobFilter(title, location, defaultUserFiltersConfig);

      expect(dynamicResult.passed).toBe(staticResult.passed);
      expect(dynamicResult.titleMatch).toBe(staticResult.titleMatch);
      expect(dynamicResult.locationMatch).toBe(staticResult.locationMatch);
      expect(dynamicResult.needsEligibilityCheck).toBe(staticResult.needsEligibilityCheck);
      if (!staticResult.passed) {
        expect(dynamicResult.reason).toBeDefined();
      }
    }
  });

  describe('Custom User Filter Modifications', () => {
    it('allows a newly added role when added to include_titles', () => {
      const customConfig: UserFiltersConfig = {
        ...defaultUserFiltersConfig,
        include_titles: [...DEFAULT_INCLUDE_TITLES, 'Technical Program Manager'],
      };
      const res = evaluateJobFilter('Technical Program Manager', 'Bengaluru, IN', customConfig);
      expect(res.passed).toBe(true);
    });

    it('blocks a custom excluded title term', () => {
      const customConfig: UserFiltersConfig = {
        ...defaultUserFiltersConfig,
        exclude_titles: [...DEFAULT_EXCLUDE_TITLES, 'Junior'],
      };
      const res = evaluateJobFilter('Junior Product Manager', 'Bengaluru, IN', customConfig);
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('Junior');
    });

    it('allows newly added custom location when in allowed_locations', () => {
      const customConfig: UserFiltersConfig = {
        ...defaultUserFiltersConfig,
        allowed_locations: [...DEFAULT_ALLOWED_LOCATIONS, 'Dubai'],
      };
      const res = evaluateJobFilter('Product Manager', 'Dubai', customConfig);
      expect(res.passed).toBe(true);
    });

    it('blocks remote roles when allow_remote is set to false', () => {
      const customConfig: UserFiltersConfig = {
        ...defaultUserFiltersConfig,
        allow_remote: false,
      };
      const res = evaluateJobFilter('Product Manager', 'Remote', customConfig);
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('Remote roles are disabled');
    });

    it('excludes "Senior Product Manager" in "Bengaluru, India" and "Lead Product Manager" with seeded user_filters row', () => {
      const seededUserFiltersRow: UserFiltersConfig = {
        include_titles: ['Product Manager', 'APM', 'Associate Product', 'Product Owner', 'Product Analyst'],
        exclude_titles: ['Director', 'Head of', 'VP', 'Principal', 'Group Product', 'Staff', 'Senior', 'Lead', 'Sr'],
        allowed_locations: ['India', 'Bangalore', 'Bengaluru', 'Mumbai', 'Pune', 'Gurgaon', 'Gurugram', 'Delhi', 'New Delhi', 'Noida', 'Hyderabad', 'Chennai'],
        allow_remote: true,
      };

      const seniorRes = evaluateJobFilter('Senior Product Manager', 'Bengaluru, India', seededUserFiltersRow);
      expect(seniorRes.passed).toBe(false);
      expect(seniorRes.titleMatch).toBe(false);
      expect(seniorRes.reason).toContain('Senior');

      const leadRes = evaluateJobFilter('Lead Product Manager', 'Bengaluru, India', seededUserFiltersRow);
      expect(leadRes.passed).toBe(false);
      expect(leadRes.titleMatch).toBe(false);
      expect(leadRes.reason).toContain('Lead');

      const srRes = evaluateJobFilter('Sr Product Manager', 'Bengaluru, India', seededUserFiltersRow);
      expect(srRes.passed).toBe(false);
      expect(srRes.titleMatch).toBe(false);
      expect(srRes.reason).toContain('Sr');
    });

    it('preserves code-level region-restricted remote exclusion even with custom user filters', () => {
      const customConfig: UserFiltersConfig = {
        ...defaultUserFiltersConfig,
        allowed_locations: ['Bengaluru'],
      };
      const res = evaluateJobFilter(
        'Product Manager',
        'New York City, Toronto, Chicago, or Remote',
        customConfig
      );
      expect(res.passed).toBe(false);
      expect(res.reason).toContain('region-restricted');
    });
  });
});
