import { describe, it, expect } from 'vitest';
import {
  countWords,
  findCliches,
  checkAntiFabrication,
  checkCompanyAndToolGrounding,
  validateOutreachCopy,
  JobGroundingContext,
} from '../validator';
import { TailoredOutreachSchema, extractAndParseJson } from '../schema';

describe('Tailor Validator & Schema Tests', () => {
  const sampleResume = 'Product Manager with 4 years experience at Swiggy leading fintech payments and scaling checkout to $12M ARR.';
  const jobContext: JobGroundingContext = {
    companyName: 'Stripe',
    jobTitle: 'Product Manager, Payments',
    jobDescription: 'Seeking a PM to lead global payout infrastructure and merchant APIs at Stripe.',
  };

  describe('Company and Entity Grounding Tests (Requirement 1)', () => {
    it('passes job own company name (Stripe)', () => {
      const text = 'I am thrilled to explore joining Stripe to lead payments infrastructure.';
      const res = checkCompanyAndToolGrounding(text, sampleResume, jobContext);
      // Stripe is in jobContext, so it is grounded
      expect(res.isGrounded).toBe(true);
      expect(res.ungroundedEntities).toHaveLength(0);
    });

    it('passes candidate resume company name (Swiggy)', () => {
      const text = 'At Swiggy, I led checkout architecture and reduced latency by 30%.';
      const res = checkCompanyAndToolGrounding(text, sampleResume, jobContext);
      // Swiggy is in resume, so it is grounded
      expect(res.isGrounded).toBe(true);
      expect(res.ungroundedEntities).toHaveLength(0);
    });

    it('flags invented company (Netflix) and removes the offending sentence', () => {
      const text = 'At Netflix, I designed video recommendation algorithms. At Swiggy, I scaled payments.';
      const res = checkCompanyAndToolGrounding(text, sampleResume, jobContext);
      expect(res.isGrounded).toBe(false);
      expect(res.ungroundedEntities).toContain('Netflix');
      expect(res.removedSentences).toContain('At Netflix, I designed video recommendation algorithms.');
      expect(res.sanitizedText).toBe('At Swiggy, I scaled payments.');
    });
  });

  describe('Gap & Cliché Detection Tests (Requirement 2)', () => {
    it('flags banned gap / shortcoming phrases', () => {
      const text = "Although I haven't worked with B2B enterprise clients and lack sales experience, I am a fast learner.";
      const cliches = findCliches(text);
      expect(cliches).toContain("although i haven't");
      expect(cliches).toContain('lack');
    });

    it('flags traditional corporate clichés', () => {
      const text = 'I am excited to apply for this role because I have a passion for building synergy.';
      const cliches = findCliches(text);
      expect(cliches).toContain('excited to apply');
      expect(cliches).toContain('passion for');
      expect(cliches).toContain('synergy');
    });

    it('passes clean text with no clichés or gap admissions', () => {
      const cleanText = 'Over 4 years at Swiggy, I delivered core payment systems and improved transaction success rates.';
      const cliches = findCliches(cleanText);
      expect(cliches).toEqual([]);
    });

    it('does not flag words containing substrings like "Slack", "black", or "blacklist"', () => {
      const text = 'Built a Slack-to-WhatsApp workflow';
      const cliches = findCliches(text);
      expect(cliches).toEqual([]);

      const blackText = 'Managed black box testing and updated the blacklist policy.';
      expect(findCliches(blackText)).toEqual([]);
    });

    describe('New banned labeling & cliché phrases', () => {
      it('flags "showing"', () => {
        expect(findCliches('Led checkout conversion, showing 15% improvement.')).toContain('showing');
      });

      it('flags "demonstrates"', () => {
        expect(findCliches('My track record demonstrates strong execution.')).toContain('demonstrates');
      });

      it('flags "demonstrating"', () => {
        expect(findCliches('Demonstrating customer obsession in every release.')).toContain('demonstrating');
      });

      it('flags "honed my skills"', () => {
        expect(findCliches('I honed my skills across 3 years at Swiggy.')).toContain('honed my skills');
      });

      it('flags "proven ability"', () => {
        expect(findCliches('With a proven ability to lead engineering pods.')).toContain('proven ability');
      });

      it('flags "I am ready to" / "i am ready to"', () => {
        expect(findCliches('I am ready to lead your global payments pod.')).toContain('i am ready to');
      });

      it('flags "measurable impact"', () => {
        expect(findCliches('Looking to deliver measurable impact at your company.')).toContain('measurable impact');
      });

      it('flags "thank you for considering"', () => {
        expect(findCliches('Thank you for considering my profile.')).toContain('thank you for considering');
      });

      it('flags "product-focused builder"', () => {
        expect(findCliches('I am a product-focused builder with fintech experience.')).toContain('product-focused builder');
      });

      it('flags "illustrating"', () => {
        expect(findCliches('Launched a self-serve portal, illustrating strong UX execution.')).toContain('illustrating');
      });

      it('flags "providing the"', () => {
        expect(findCliches('Owned merchant integrations, providing the foundation for scale.')).toContain('providing the');
      });

      it('flags "the ability to"', () => {
        expect(findCliches('Developed the ability to ship features under tight deadlines.')).toContain('the ability to');
      });
    });
  });

  describe('Length Bound Enforcement Tests (Requirement 4)', () => {
    it('validates word counts within exact bounds (Cover Note 130-170, Referral < 90)', () => {
      // 140-word cover note
      const coverWordsList = Array(140).fill('word').join(' ');
      // 60-word referral message
      const referralWordsList = Array(60).fill('word').join(' ');

      const res = validateOutreachCopy(coverWordsList, referralWordsList, sampleResume, jobContext);
      expect(res.coverNoteWordCount).toBe(140);
      expect(res.referralMessageWordCount).toBe(60);
      expect(res.isLengthValid).toBe(true);
    });

    it('flags cover note outside 130-170 words', () => {
      const shortCover = Array(100).fill('word').join(' ');
      const referral = Array(50).fill('word').join(' ');

      const res = validateOutreachCopy(shortCover, referral, sampleResume, jobContext);
      expect(res.isLengthValid).toBe(false);
      expect(res.coverNoteWordCount).toBe(100);
    });

    it('flags referral message >= 90 words', () => {
      const cover = Array(145).fill('word').join(' ');
      const longReferral = Array(95).fill('word').join(' ');

      const res = validateOutreachCopy(cover, longReferral, sampleResume, jobContext);
      expect(res.isLengthValid).toBe(false);
      expect(res.referralMessageWordCount).toBe(95);
    });
  });

  describe('Schema & JSON Extraction Tests', () => {
    it('parses valid JSON and strips reasoning tags', () => {
      const raw = `<think>
Drafting cover note...
</think>
\`\`\`json
{
  "cover_note": "Over 4 years in fintech product management, I led payments at Swiggy.",
  "referral_message": "Hi Sarah, I saw the PM opening at Stripe."
}
\`\`\``;

      const parsed = extractAndParseJson(raw);
      const validated = TailoredOutreachSchema.parse(parsed);
      expect(validated.cover_note).toContain('Over 4 years in fintech');
      expect(validated.referral_message).toContain('Hi Sarah');
    });
  });
});
