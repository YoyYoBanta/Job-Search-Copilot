import { isBulletInResume } from '@/lib/matcher/bulletChecker';
import {
  AtsScanResult,
  AtsCoverageBreakdown,
  AddWordSuggestion,
  DoNotClaimTerm,
  MatchedTerm,
  TitleAlignment,
} from './types';
import { AtsScanLlmOutput } from './schema';

/**
 * Extracts numeric tokens (numbers, percentages, multipliers like 20%, 1.5M, 10k, 3x) from text.
 */
function extractNumericTokens(text: string): string[] {
  const matches = text.match(/\b\d+(?:[.,]\d+)?%?(?:[kKmMbB]|x|X)?\b/g);
  return matches ? matches.map((m) => m.toLowerCase()) : [];
}

/**
 * Verifies that a suggested rewrite does not introduce new numbers or metrics
 * not found in the original bullet or resume.
 */
export function isRewriteTruthful(
  suggestedRewrite: string,
  originalBullet: string,
  resumeText: string
): boolean {
  if (!suggestedRewrite || !suggestedRewrite.trim()) return false;
  const rewriteNumbers = extractNumericTokens(suggestedRewrite);
  if (rewriteNumbers.length === 0) return true;

  const originalNumbers = new Set([
    ...extractNumericTokens(originalBullet),
    ...extractNumericTokens(resumeText),
  ]);

  for (const num of rewriteNumbers) {
    if (!originalNumbers.has(num)) {
      return false; // Fabricated new metric/number
    }
  }

  return true;
}

/**
 * Sorts terms placing 'required' items first, followed by 'preferred'.
 */
export function sortTermsRequiredFirst<T extends { importance: 'required' | 'preferred' }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    if (a.importance === 'required' && b.importance === 'preferred') return -1;
    if (a.importance === 'preferred' && b.importance === 'required') return 1;
    return 0;
  });
}

/**
 * Validates ATS LLM output, applies anti-fabrication gates, and computes coverage metrics.
 */
export function validateAndComputeAtsScan(
  llmOutput: AtsScanLlmOutput,
  resumeText: string,
  fingerprint: string,
  modelUsed: string
): AtsScanResult {
  const verifiedMatched: MatchedTerm[] = [];
  for (const m of llmOutput.matched_terms || []) {
    if (m.term && m.term.trim()) {
      verifiedMatched.push({
        term: m.term.trim(),
        importance: m.importance,
        category: m.category,
        found_in_resume: (m.found_in_resume || '').trim(),
      });
    }
  }

  const verifiedAddWords: AddWordSuggestion[] = [];
  const verifiedDoNotClaim: DoNotClaimTerm[] = [];

  // Initialize do_not_claim from LLM output
  for (const d of llmOutput.missing_terms?.do_not_claim || []) {
    if (d.term && d.term.trim()) {
      verifiedDoNotClaim.push({
        term: d.term.trim(),
        importance: d.importance,
        category: d.category,
        reason: (d.reason || 'No supporting evidence found in resume').trim(),
      });
    }
  }

  // Validate each add_these_words candidate against resume
  for (const item of llmOutput.missing_terms?.add_these_words || []) {
    if (!item.term || !item.term.trim()) continue;

    const term = item.term.trim();
    const supportingBullet = (item.supporting_resume_bullet || '').trim();

    // 1. Verbatim check on supporting bullet
    const hasVerbatimEvidence =
      supportingBullet.length > 0 && isBulletInResume(supportingBullet, resumeText);

    if (!hasVerbatimEvidence) {
      // Demote to do_not_claim due to lack of verifiable evidence
      verifiedDoNotClaim.push({
        term,
        importance: item.importance,
        category: item.category,
        reason: item.reason
          ? `${item.reason} (Demoted: No verbatim evidence in resume)`
          : 'No verbatim evidence found in resume to support this term',
      });
      continue;
    }

    // 2. Validate suggested rewrite for truthfulness
    let finalRewrite: string | undefined = undefined;
    let rewriteVerified = false;

    if (item.suggested_rewrite && item.suggested_rewrite.trim()) {
      const candidateRewrite = item.suggested_rewrite.trim();
      const isTruthful = isRewriteTruthful(candidateRewrite, supportingBullet, resumeText);

      if (isTruthful) {
        finalRewrite = candidateRewrite;
        rewriteVerified = true;
      }
    }

    verifiedAddWords.push({
      term,
      importance: item.importance,
      category: item.category,
      reason: item.reason || 'Experience evidence exists under different phrasing',
      supporting_resume_bullet: supportingBullet,
      suggested_rewrite: finalRewrite,
      rewrite_verified: rewriteVerified,
    });
  }

  // Sort terms: required first, then preferred
  const sortedMatched = sortTermsRequiredFirst(verifiedMatched);
  const sortedAddWords = sortTermsRequiredFirst(verifiedAddWords);
  const sortedDoNotClaim = sortTermsRequiredFirst(verifiedDoNotClaim);

  // Compute Coverage Breakdown
  const totalRequired =
    sortedMatched.filter((t) => t.importance === 'required').length +
    sortedAddWords.filter((t) => t.importance === 'required').length +
    sortedDoNotClaim.filter((t) => t.importance === 'required').length;

  const matchedRequired = sortedMatched.filter((t) => t.importance === 'required').length;

  const totalPreferred =
    sortedMatched.filter((t) => t.importance === 'preferred').length +
    sortedAddWords.filter((t) => t.importance === 'preferred').length +
    sortedDoNotClaim.filter((t) => t.importance === 'preferred').length;

  const matchedPreferred = sortedMatched.filter((t) => t.importance === 'preferred').length;

  const totalTerms = totalRequired + totalPreferred;
  const totalMatched = matchedRequired + matchedPreferred;

  const overallPercentage = totalTerms > 0 ? Math.round((totalMatched / totalTerms) * 100) : 0;

  const coverage: AtsCoverageBreakdown = {
    overall_percentage: overallPercentage,
    required_matched: matchedRequired,
    required_total: totalRequired,
    preferred_matched: matchedPreferred,
    preferred_total: totalPreferred,
  };

  const titleAlignment: TitleAlignment = {
    current_title: llmOutput.title_alignment?.current_title || 'Product Manager',
    target_title: llmOutput.title_alignment?.target_title || 'Product Manager',
    suggested_headline: llmOutput.title_alignment?.suggested_headline || 'Product Manager',
    rationale: llmOutput.title_alignment?.rationale || '',
  };

  return {
    coverage,
    matched_terms: sortedMatched,
    missing_terms: {
      add_these_words: sortedAddWords,
      do_not_claim: sortedDoNotClaim,
    },
    title_alignment: titleAlignment,
    resume_fingerprint: fingerprint,
    scanned_at: new Date().toISOString(),
    model_used: modelUsed,
  };
}
