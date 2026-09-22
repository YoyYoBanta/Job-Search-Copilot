import { z } from 'zod';
import { extractAndParseJson } from '@/lib/groq/schema';

export const TermImportanceSchema = z.enum(['required', 'preferred']);
export const TermCategorySchema = z.enum(['hard_skill', 'tool', 'domain', 'soft_skill']);

export const MatchedTermRawSchema = z.object({
  term: z.string().min(1),
  importance: TermImportanceSchema.catch('required'),
  category: TermCategorySchema.catch('hard_skill'),
  found_in_resume: z.string().default(''),
});

export const AddWordSuggestionRawSchema = z.object({
  term: z.string().min(1),
  importance: TermImportanceSchema.catch('required'),
  category: TermCategorySchema.catch('hard_skill'),
  reason: z.string().default(''),
  supporting_resume_bullet: z.string().default(''),
  suggested_rewrite: z.string().optional(),
});

export const DoNotClaimTermRawSchema = z.object({
  term: z.string().min(1),
  importance: TermImportanceSchema.catch('required'),
  category: TermCategorySchema.catch('hard_skill'),
  reason: z.string().default(''),
});

export const TitleAlignmentRawSchema = z.object({
  current_title: z.string().default('Product Manager'),
  target_title: z.string().default('Product Manager'),
  suggested_headline: z.string().default('Product Manager'),
  rationale: z.string().default(''),
});

export const AtsScanLlmOutputSchema = z.object({
  matched_terms: z.array(MatchedTermRawSchema).default([]),
  missing_terms: z.object({
    add_these_words: z.array(AddWordSuggestionRawSchema).default([]),
    do_not_claim: z.array(DoNotClaimTermRawSchema).default([]),
  }).default({ add_these_words: [], do_not_claim: [] }),
  title_alignment: TitleAlignmentRawSchema.default({
    current_title: 'Product Manager',
    target_title: 'Product Manager',
    suggested_headline: 'Product Manager',
    rationale: '',
  }),
});

export type AtsScanLlmOutput = z.infer<typeof AtsScanLlmOutputSchema>;

/**
 * Parses and validates raw LLM JSON output against the ATS Scan schema.
 */
export function parseAtsScanLlmOutput(rawText: string): AtsScanLlmOutput {
  const parsedJson = extractAndParseJson(rawText);
  return AtsScanLlmOutputSchema.parse(parsedJson);
}
