import { describe, it, expect } from 'vitest';
import {
  evaluateJobFilter,
  evaluateTitle,
  evaluateLocation,
} from '../filters';

describe('Job Filters Specification Tests (Section 7 Requirements)', () => {
  describe('Location & Remote Eligibility Tests', () => {
    it('passes "Bengaluru, IN" (India city + uppercase IN country code)', () => {
      const res = evaluateLocation('Bengaluru, IN');
      expect(res.matched).toBe(true);
      expect(res.needsEligibilityCheck).toBe(false);
    });

    it('fails "Singapore" (non-India location and not matching IN token)', () => {
      const res = evaluateLocation('Singapore');
      expect(res.matched).toBe(false);
    });

    it('fails "Hybrid in London" (lowercase "in" is not country code IN and London is foreign)', () => {
      const res = evaluateLocation('Hybrid in London');
      expect(res.matched).toBe(false);
    });

    it('fails "Remote - US" (remote tied to foreign country)', () => {
      const res = evaluateLocation('Remote - US');
      expect(res.matched).toBe(false);
    });

    it('passes "Remote" with Check eligibility badge (country-less general remote)', () => {
      const res = evaluateLocation('Remote');
      expect(res.matched).toBe(true);
      expect(res.needsEligibilityCheck).toBe(true);
    });

    it('passes "Hybrid - Gurugram" (hybrid paired with approved India city)', () => {
      const res = evaluateLocation('Hybrid - Gurugram');
      expect(res.matched).toBe(true);
      expect(res.needsEligibilityCheck).toBe(false);
    });

    it('passes "Remote - India" without badge (remote explicitly for India)', () => {
      const res = evaluateLocation('Remote - India');
      expect(res.matched).toBe(true);
      expect(res.needsEligibilityCheck).toBe(false);
    });

    it('fails "Remote (EU only)"', () => {
      const res = evaluateLocation('Remote (EU only)');
      expect(res.matched).toBe(false);
    });

    it('fails "Berlin"', () => {
      const res = evaluateLocation('Berlin');
      expect(res.matched).toBe(false);
    });
  });

  describe('Title Inclusion & Exclusion Tests', () => {
    it('fails "Director of Product" (contains excluded seniority term "Director")', () => {
      const res = evaluateTitle('Director of Product');
      expect(res.matched).toBe(false);
      expect(res.reason).toContain('Director');
    });

    it('passes "Associate Product Manager" (included product role)', () => {
      const res = evaluateTitle('Associate Product Manager');
      expect(res.matched).toBe(true);
    });

    it('passes "APM"', () => {
      const res = evaluateTitle('APM');
      expect(res.matched).toBe(true);
    });

    it('passes "Product Owner"', () => {
      const res = evaluateTitle('Product Owner');
      expect(res.matched).toBe(true);
    });

    it('passes "Senior Product Analyst"', () => {
      const res = evaluateTitle('Senior Product Analyst');
      expect(res.matched).toBe(true);
    });

    it('fails "VP of Product"', () => {
      const res = evaluateTitle('VP of Product');
      expect(res.matched).toBe(false);
    });

    it('fails "Staff Product Manager"', () => {
      const res = evaluateTitle('Staff Product Manager');
      expect(res.matched).toBe(false);
    });

    it('fails "Group Product Manager"', () => {
      const res = evaluateTitle('Group Product Manager');
      expect(res.matched).toBe(false);
    });

    it('fails "Head of Product"', () => {
      const res = evaluateTitle('Head of Product');
      expect(res.matched).toBe(false);
    });

    it('fails "Software Engineer"', () => {
      const res = evaluateTitle('Software Engineer');
      expect(res.matched).toBe(false);
    });
  });

  describe('Full Job Evaluation Combined Tests', () => {
    it('passes Product Manager in Bengaluru, IN', () => {
      const res = evaluateJobFilter('Product Manager', 'Bengaluru, IN');
      expect(res.passed).toBe(true);
      expect(res.needsEligibilityCheck).toBe(false);
    });

    it('passes Associate Product Manager in Remote with Check eligibility flag', () => {
      const res = evaluateJobFilter('Associate Product Manager', 'Remote');
      expect(res.passed).toBe(true);
      expect(res.needsEligibilityCheck).toBe(true);
    });

    it('fails Director of Product in Bengaluru, IN', () => {
      const res = evaluateJobFilter('Director of Product', 'Bengaluru, IN');
      expect(res.passed).toBe(false);
    });

    it('fails Product Manager in Hybrid in London', () => {
      const res = evaluateJobFilter('Product Manager', 'Hybrid in London');
      expect(res.passed).toBe(false);
    });

    it('fails Product Manager in Remote - US', () => {
      const res = evaluateJobFilter('Product Manager', 'Remote - US');
      expect(res.passed).toBe(false);
    });
  });
});
