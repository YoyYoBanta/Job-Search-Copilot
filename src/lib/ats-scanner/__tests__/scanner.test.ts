import { describe, it, expect } from 'vitest';
import { computeResumeFingerprint, isAtsScanStale } from '../fingerprint';
import {
  validateAndComputeAtsScan,
  isRewriteTruthful,
  sortTermsRequiredFirst,
} from '../validator';
import { buildAtsScanPrompt } from '../prompts';
import { parseAtsScanLlmOutput } from '../schema';
import { AtsScanLlmOutput } from '../schema';

describe('ATS Keyword Scanner & Validator Suite', () => {
  const sampleResume = `
John Doe - Senior Product Manager
Experience:
- Led the zero-to-one launch of a mobile payments SDK used by 40+ fintech partners, increasing partner integration speed by 25%.
- Partnered closely with engineering and design leads across sprints to roadmap core payment gateway APIs.
- Built automated SQL dashboards in Looker to track user retention and funnel drop-offs.
- Conducted user research interviews with 15 enterprise clients to refine product requirements.
`;

  describe('1. Stale Scan Detection', () => {
    it('computes deterministic resume fingerprints', () => {
      const fp1 = computeResumeFingerprint(sampleResume);
      const fp2 = computeResumeFingerprint(sampleResume);
      expect(fp1).toBe(fp2);
      expect(fp1.length).toBe(64); // SHA-256 hex
    });

    it('identifies scan as fresh when resume matches fingerprint', () => {
      const fp = computeResumeFingerprint(sampleResume);
      expect(isAtsScanStale(fp, sampleResume)).toBe(false);
    });

    it('detects stale scan when resume content changes', () => {
      const fp = computeResumeFingerprint(sampleResume);
      const updatedResume = sampleResume + '\n- Added new certification in AI Product Management.';
      expect(isAtsScanStale(fp, updatedResume)).toBe(true);
    });

    it('handles null/undefined fingerprints safely', () => {
      expect(isAtsScanStale(null, sampleResume)).toBe(false);
      expect(isAtsScanStale(undefined, sampleResume)).toBe(false);
    });
  });

  describe('2. Required vs Preferred Classification & Ordering', () => {
    it('sorts terms with required importance first', () => {
      const terms: Array<{ term: string; importance: 'required' | 'preferred' }> = [
        { term: 'GraphQL', importance: 'preferred' },
        { term: 'SQL', importance: 'required' },
        { term: 'Python', importance: 'preferred' },
        { term: 'Roadmapping', importance: 'required' },
      ];

      const sorted = sortTermsRequiredFirst(terms);
      expect(sorted[0].term).toBe('SQL');
      expect(sorted[0].importance).toBe('required');
      expect(sorted[1].term).toBe('Roadmapping');
      expect(sorted[1].importance).toBe('required');
      expect(sorted[2].importance).toBe('preferred');
      expect(sorted[3].importance).toBe('preferred');
    });
  });

  describe('3. Anti-Fabrication: Supporting Resume Bullets', () => {
    it('keeps evidence-backed suggestion with verbatim quote in add_these_words', () => {
      const mockLlmOutput: AtsScanLlmOutput = {
        matched_terms: [
          {
            term: 'SQL',
            importance: 'required',
            category: 'hard_skill',
            found_in_resume: 'Built automated SQL dashboards in Looker',
          },
        ],
        missing_terms: {
          add_these_words: [
            {
              term: 'Stakeholder Management',
              importance: 'required',
              category: 'soft_skill',
              reason: 'Resume demonstrates partnership with engineering and design leads',
              supporting_resume_bullet:
                'Partnered closely with engineering and design leads across sprints to roadmap core payment gateway APIs.',
              suggested_rewrite:
                'Managed key engineering and design stakeholders across sprints to roadmap core payment gateway APIs.',
            },
          ],
          do_not_claim: [],
        },
        title_alignment: {
          current_title: 'Senior Product Manager',
          target_title: 'Lead PM',
          suggested_headline: 'Senior Product Manager | Payments',
          rationale: 'Aligns with target scope',
        },
      };

      const result = validateAndComputeAtsScan(
        mockLlmOutput,
        sampleResume,
        'mock-fp',
        'mock-model'
      );

      expect(result.missing_terms.add_these_words.length).toBe(1);
      expect(result.missing_terms.add_these_words[0].term).toBe('Stakeholder Management');
      expect(result.missing_terms.add_these_words[0].rewrite_verified).toBe(true);
      expect(result.missing_terms.do_not_claim.length).toBe(0);
    });

    it('demotes hallucinated/unsupported suggestion to do_not_claim', () => {
      const mockLlmOutput: AtsScanLlmOutput = {
        matched_terms: [],
        missing_terms: {
          add_these_words: [
            {
              term: 'Machine Learning Pipelines',
              importance: 'required',
              category: 'hard_skill',
              reason: 'Candidate worked on ML models',
              supporting_resume_bullet:
                'Designed deep neural network algorithms for real-time computer vision detection.', // NOT in resume!
              suggested_rewrite: 'Designed deep neural network algorithms and ML pipelines.',
            },
          ],
          do_not_claim: [],
        },
        title_alignment: {
          current_title: 'PM',
          target_title: 'AI PM',
          suggested_headline: 'Product Manager',
          rationale: '',
        },
      };

      const result = validateAndComputeAtsScan(
        mockLlmOutput,
        sampleResume,
        'mock-fp',
        'mock-model'
      );

      // Must be demoted from add_these_words to do_not_claim
      expect(result.missing_terms.add_these_words.length).toBe(0);
      expect(result.missing_terms.do_not_claim.length).toBe(1);
      expect(result.missing_terms.do_not_claim[0].term).toBe('Machine Learning Pipelines');
      expect(result.missing_terms.do_not_claim[0].reason).toContain('No verbatim evidence');
    });
  });

  describe('4. Anti-Fabrication: Truthful Rewrites Check', () => {
    it('accepts truthful rewrites that preserve existing metrics and numbers', () => {
      const original = 'Led the zero-to-one launch of a mobile payments SDK used by 40+ fintech partners, increasing partner integration speed by 25%.';
      const truthfulRewrite = 'Spearheaded zero-to-one launch of a payments SDK used by 40+ partners with 25% faster integration.';

      expect(isRewriteTruthful(truthfulRewrite, original, sampleResume)).toBe(true);
    });

    it('rejects fabricated rewrites that invent new numbers/metrics', () => {
      const original = 'Led the zero-to-one launch of a mobile payments SDK used by 40+ fintech partners, increasing partner integration speed by 25%.';
      const fabricatedRewrite = 'Led the launch of a mobile payments SDK generating $10M ARR across 500k active users.'; // Invented $10M and 500k!

      expect(isRewriteTruthful(fabricatedRewrite, original, sampleResume)).toBe(false);
    });

    it('drops unverified rewrite while keeping the original bullet in add_these_words', () => {
      const mockLlmOutput: AtsScanLlmOutput = {
        matched_terms: [],
        missing_terms: {
          add_these_words: [
            {
              term: 'API Strategy',
              importance: 'required',
              category: 'hard_skill',
              reason: 'Worked on APIs',
              supporting_resume_bullet:
                'Partnered closely with engineering and design leads across sprints to roadmap core payment gateway APIs.',
              suggested_rewrite:
                'Defined API Strategy driving $50M in new revenue across 200 enterprise customers.', // Fabricated metrics!
            },
          ],
          do_not_claim: [],
        },
        title_alignment: {
          current_title: 'PM',
          target_title: 'PM',
          suggested_headline: 'PM',
          rationale: '',
        },
      };

      const result = validateAndComputeAtsScan(
        mockLlmOutput,
        sampleResume,
        'mock-fp',
        'mock-model'
      );

      expect(result.missing_terms.add_these_words.length).toBe(1);
      expect(result.missing_terms.add_these_words[0].term).toBe('API Strategy');
      // Rewrite should be dropped because it contains fabricated numbers
      expect(result.missing_terms.add_these_words[0].rewrite_verified).toBe(false);
      expect(result.missing_terms.add_these_words[0].suggested_rewrite).toBeUndefined();
    });
  });

  describe('5. Coverage Mathematics', () => {
    it('computes exact dual coverage breakdown and overall percentage', () => {
      const mockLlmOutput: AtsScanLlmOutput = {
        matched_terms: [
          { term: 'SQL', importance: 'required', category: 'hard_skill', found_in_resume: 'SQL dashboards' },
          { term: 'Looker', importance: 'required', category: 'tool', found_in_resume: 'Looker' },
          { term: 'Figma', importance: 'preferred', category: 'tool', found_in_resume: 'design leads' },
        ],
        missing_terms: {
          add_these_words: [
            {
              term: 'Stakeholder Management',
              importance: 'required',
              category: 'soft_skill',
              reason: 'Partnership with leads',
              supporting_resume_bullet:
                'Partnered closely with engineering and design leads across sprints to roadmap core payment gateway APIs.',
            },
          ],
          do_not_claim: [
            { term: 'Kubernetes', importance: 'required', category: 'tool', reason: 'No cloud infra exp' },
            { term: 'Go/Golang', importance: 'preferred', category: 'hard_skill', reason: 'No Golang' },
          ],
        },
        title_alignment: {
          current_title: 'PM',
          target_title: 'Staff PM',
          suggested_headline: 'Senior PM',
          rationale: '',
        },
      };

      const result = validateAndComputeAtsScan(
        mockLlmOutput,
        sampleResume,
        'fp-123',
        'model-xyz'
      );

      // Required total = 2 matched (SQL, Looker) + 1 add (Stakeholder Management) + 1 do not claim (Kubernetes) = 4
      // Required matched = 2
      expect(result.coverage.required_matched).toBe(2);
      expect(result.coverage.required_total).toBe(4);

      // Preferred total = 1 matched (Figma) + 1 do not claim (Go/Golang) = 2
      // Preferred matched = 1
      expect(result.coverage.preferred_matched).toBe(1);
      expect(result.coverage.preferred_total).toBe(2);

      // Overall: (2 + 1) / (4 + 2) = 3 / 6 = 50%
      expect(result.coverage.overall_percentage).toBe(50);
    });

    it('handles zero total terms gracefully', () => {
      const emptyOutput: AtsScanLlmOutput = {
        matched_terms: [],
        missing_terms: { add_these_words: [], do_not_claim: [] },
        title_alignment: {
          current_title: 'PM',
          target_title: 'PM',
          suggested_headline: 'PM',
          rationale: '',
        },
      };

      const result = validateAndComputeAtsScan(emptyOutput, sampleResume, 'fp', 'model');
      expect(result.coverage.overall_percentage).toBe(0);
      expect(result.coverage.required_total).toBe(0);
      expect(result.coverage.preferred_total).toBe(0);
    });
  });

  describe('6. Prompt Builder & Schema Validation', () => {
    it('builds prompt instructing model to exclude boilerplate', () => {
      const { systemMessage, userMessage } = buildAtsScanPrompt({
        resumeText: sampleResume,
        jobTitle: 'Product Lead',
        companyName: 'Stripe',
        jobDescription: 'Requirements:\n- 5+ years PM\n- SQL\nEqual Opportunity Employer. 401(k) and health insurance provided.',
      });

      expect(systemMessage).toContain('IGNORE BOILERPLATE');
      expect(systemMessage).toContain('Equal Opportunity Employer');
      expect(systemMessage).toContain('add_these_words');
      expect(systemMessage).toContain('do_not_claim');
      expect(userMessage).toContain('Stripe');
      expect(userMessage).toContain('Product Lead');
    });

    it('parses valid JSON matching LLM output schema', () => {
      const jsonStr = JSON.stringify({
        matched_terms: [
          { term: 'SQL', importance: 'required', category: 'hard_skill', found_in_resume: 'SQL' },
        ],
        missing_terms: {
          add_these_words: [],
          do_not_claim: [{ term: 'Java', importance: 'preferred', category: 'hard_skill', reason: 'No Java' }],
        },
        title_alignment: {
          current_title: 'PM',
          target_title: 'Lead PM',
          suggested_headline: 'Senior Product Manager',
          rationale: 'Good match',
        },
      });

      const parsed = parseAtsScanLlmOutput(jsonStr);
      expect(parsed.matched_terms.length).toBe(1);
      expect(parsed.missing_terms.do_not_claim.length).toBe(1);
      expect(parsed.title_alignment.suggested_headline).toBe('Senior Product Manager');
    });
  });
});
