import { describe, it, expect } from 'vitest';
import { extractAndParseJson, FitScoreResponseSchema } from '../schema';

describe('Groq Fit Scoring Schema & JSON Parser', () => {
  it('parses valid raw JSON strings', () => {
    const raw = JSON.stringify({
      fit_score: 85,
      top_reasons: ['Strong SQL skills', 'Prior B2B SaaS experience'],
      gaps: ['No direct healthcare experience'],
      recommended_resume_bullets_to_lead_with: ['Spearheaded billing roadmap reducing error rates by 42%'],
      seniority_match: 'fit',
    });

    const parsed = extractAndParseJson(raw);
    const validated = FitScoreResponseSchema.parse(parsed);

    expect(validated.fit_score).toBe(85);
    expect(validated.seniority_match).toBe('fit');
    expect(validated.top_reasons).toHaveLength(2);
    expect(validated.gaps).toHaveLength(1);
  });

  it('extracts and parses JSON wrapped in markdown code fences', () => {
    const llmOutput = `
Here is the evaluation of candidate fit:

\`\`\`json
{
  "fit_score": 92,
  "top_reasons": [
    "5+ years fintech experience matches JD exactly",
    "Extensive experience with Stripe APIs"
  ],
  "gaps": [],
  "recommended_resume_bullets_to_lead_with": [
    "Led cross-functional launch of checkout revamp"
  ],
  "seniority_match": "fit"
}
\`\`\`

Hope this helps!
`;

    const parsed = extractAndParseJson(llmOutput);
    const validated = FitScoreResponseSchema.parse(parsed);

    expect(validated.fit_score).toBe(92);
    expect(validated.seniority_match).toBe('fit');
    expect(validated.top_reasons).toHaveLength(2);
  });

  it('handles trailing commas in JSON gracefully', () => {
    const jsonWithTrailingCommas = `{
      "fit_score": 45,
      "top_reasons": ["Has relevant technical background",],
      "gaps": ["Requires 8+ years PM experience; candidate has 1 year",],
      "recommended_resume_bullets_to_lead_with": [],
      "seniority_match": "over",
    }`;

    const parsed = extractAndParseJson(jsonWithTrailingCommas);
    const validated = FitScoreResponseSchema.parse(parsed);

    expect(validated.fit_score).toBe(45);
    expect(validated.seniority_match).toBe('over');
    expect(validated.gaps).toHaveLength(1);
  });

  it('validates seniority_match enum values ("under", "fit", "over")', () => {
    const validData = {
      fit_score: 50,
      top_reasons: ['Reason 1'],
      gaps: [],
      recommended_resume_bullets_to_lead_with: [],
      seniority_match: 'under',
    };
    expect(FitScoreResponseSchema.safeParse(validData).success).toBe(true);

    const invalidData = {
      ...validData,
      seniority_match: 'intermediate', // Not in enum
    };
    expect(FitScoreResponseSchema.safeParse(invalidData).success).toBe(false);
  });

  it('rejects fit_score outside 0-100 range', () => {
    const invalidHigh = {
      fit_score: 110,
      top_reasons: ['Reason'],
      gaps: [],
      recommended_resume_bullets_to_lead_with: [],
      seniority_match: 'fit',
    };
    expect(FitScoreResponseSchema.safeParse(invalidHigh).success).toBe(false);

    const invalidLow = {
      ...invalidHigh,
      fit_score: -5,
    };
    expect(FitScoreResponseSchema.safeParse(invalidLow).success).toBe(false);
  });
});
