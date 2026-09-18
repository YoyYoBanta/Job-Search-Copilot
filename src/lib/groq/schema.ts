import { z } from 'zod';

export const FitScoreResponseSchema = z.object({
  fit_score: z.number().min(0).max(100),
  top_reasons: z.array(z.string()).min(1).max(3),
  gaps: z.array(z.string()),
  recommended_resume_bullets_to_lead_with: z.array(z.string()),
  seniority_match: z.enum(['under', 'fit', 'over']),
});

export type FitScoreResponse = z.infer<typeof FitScoreResponseSchema>;

/**
 * Extracts JSON content from raw LLM output, handling reasoning tags (<think>...</think>),
 * markdown fences, and trailing commas.
 */
export function extractAndParseJson(text: string): unknown {
  if (!text || typeof text !== 'string') {
    throw new Error('Empty or non-string response from LLM');
  }

  let cleaned = text.trim();

  // 1. Strip reasoning blocks (<think>...</think>) if emitted by reasoning models
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 2. Remove markdown code fences if present (```json ... ``` or ``` ...)
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    cleaned = fenceMatch[1].trim();
  }

  // 3. Find outermost JSON object
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  }

  // 4. Remove trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  try {
    return JSON.parse(cleaned);
  } catch (err: any) {
    throw new Error(`Failed to parse JSON from LLM: ${err.message}. Raw text: ${text.slice(0, 150)}...`);
  }
}
