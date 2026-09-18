import { describe, it, expect } from 'vitest';
import {
  countWords,
  findCliches,
  checkAntiFabrication,
  validateOutreachCopy,
} from '../validator';
import { TailoredOutreachSchema, extractAndParseJson } from '../schema';

describe('Tailor Validator & Schema Tests', () => {
  describe('Word Counter Tests', () => {
    it('counts words accurately', () => {
      expect(countWords('Hello world')).toBe(2);
      expect(countWords('   Multiple   spaces  between   words. ')).toBe(4);
      expect(countWords('')).toBe(0);
    });
  });

  describe('Cliché Detection Tests', () => {
    it('identifies forbidden clichés', () => {
      const text = 'I am excited to apply for this role because I have a passion for building synergy.';
      const cliches = findCliches(text);
      expect(cliches).toContain('excited to apply');
      expect(cliches).toContain('passion for');
      expect(cliches).toContain('synergy');
    });

    it('returns empty array when no clichés are present', () => {
      const cleanText = 'I led the rollout of Stripe Payments across APAC, reducing merchant onboarding latency by 35%.';
      const cliches = findCliches(cleanText);
      expect(cliches).toEqual([]);
    });
  });

  describe('Anti-Fabrication Metric Verification Tests', () => {
    const resumeText = 'Spearheaded growth initiatives resulting in $12M revenue and 45% increase in user engagement at Swiggy.';

    it('passes verified metrics that exist in resume', () => {
      const generated = 'At Swiggy, I helped deliver $12M revenue with a 45% increase in engagement.';
      const warnings = checkAntiFabrication(generated, resumeText);
      expect(warnings).toHaveLength(0);
    });

    it('flags invented metrics that do not exist in resume', () => {
      const generated = 'Scaled products to $50M ARR and achieved 99% retention.';
      const warnings = checkAntiFabrication(generated, resumeText);
      expect(warnings.length).toBeGreaterThanOrEqual(1);
      expect(warnings[0]).toContain('$50M');
    });
  });

  describe('Full Outreach Copy Validation Tests', () => {
    const resumeText = 'Product manager with 4 years experience leading fintech payment systems.';

    it('validates clean, grounded copy successfully', () => {
      const coverNote = 'Over the last 4 years in fintech, I led the development and deployment of payment systems. My background aligns directly with your checkout infrastructure roadmap.';
      const referralMessage = 'Hi Sarah, I saw the PM opening on your team at Razorpay and would love to connect. I have 4 years building fintech payment systems and would appreciate any insights or an internal referral.';

      const result = validateOutreachCopy(coverNote, referralMessage, resumeText);
      expect(result.isValid).toBe(true);
      expect(result.clichesFound).toHaveLength(0);
      expect(result.coverNoteWordCount).toBeGreaterThan(20);
      expect(result.referralMessageWordCount).toBeGreaterThan(15);
    });

    it('flags invalid copy with clichés', () => {
      const coverNote = 'I am excited to apply for this unique opportunity and bring synergy to your fast-paced environment.';
      const referralMessage = 'I am the ideal candidate and ready to hit the ground running.';

      const result = validateOutreachCopy(coverNote, referralMessage, resumeText);
      expect(result.isValid).toBe(false);
      expect(result.clichesFound.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Schema & JSON Extraction Tests', () => {
    it('parses valid JSON matching schema', () => {
      const raw = JSON.stringify({
        cover_note: 'This is a valid concise cover note for the product role.',
        referral_message: 'Hi, I am reaching out regarding the open PM position.',
      });

      const parsed = extractAndParseJson(raw);
      const validated = TailoredOutreachSchema.parse(parsed);
      expect(validated.cover_note).toContain('valid concise cover note');
      expect(validated.referral_message).toContain('reaching out regarding');
    });

    it('strips <think> reasoning tags and markdown fences', () => {
      const raw = `<think>
Drafting cover note...
Ensure no clichés and keep referral under 80 words.
</think>
\`\`\`json
{
  "cover_note": "Here is a tailored cover note grounded in the candidate experience.",
  "referral_message": "Hi, I would love to connect about the PM opening."
}
\`\`\``;

      const parsed = extractAndParseJson(raw);
      const validated = TailoredOutreachSchema.parse(parsed);
      expect(validated.cover_note).toContain('Here is a tailored cover note');
    });
  });
});
