import { FORBIDDEN_CLICHES } from './prompts';

export interface JobGroundingContext {
  companyName: string;
  jobTitle: string;
  jobDescription: string;
}

export interface GroundingCheckResult {
  isGrounded: boolean;
  ungroundedEntities: string[];
  sanitizedText: string;
  removedSentences: string[];
}

export interface ValidationResult {
  isValid: boolean;
  clichesFound: string[];
  fabricationWarnings: string[];
  isLengthValid: boolean;
  coverNoteWordCount: number;
  referralMessageWordCount: number;
  sanitizedCoverNote: string;
  sanitizedReferralMessage: string;
}

/**
 * Counts words in a string.
 */
export function countWords(text: string): number {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Detects presence of forbidden corporate clichés and gap/shortcoming phrases
 * using whole-word, case-insensitive regex boundary matching.
 */
export function findCliches(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const cliche of FORBIDDEN_CLICHES) {
    const escaped = escapeRegExp(cliche);
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(text)) {
      found.push(cliche);
    }
  }
  return found;
}

/**
 * Splits text into sentences cleanly.
 */
export function splitSentences(text: string): string[] {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Common English stopwords / non-company nouns that might follow prepositions.
 */
const COMMON_NON_COMPANY_WORDS = new Set([
  'the', 'a', 'an', 'this', 'that', 'my', 'our', 'scale', 'product', 'growth',
  'fintech', 'saas', 'engineering', 'leadership', 'analytics', 'design', 'work',
  'speed', 'first', 'all', 'hand', 'pace', 'scratch', 'stakeholders', 'users',
  'customers', 'cross-functional', 'multiple', 'various', 'several', 'global',
  'remote', 'hybrid', 'india', 'apac', 'us', 'uk', 'europe', 'start', 'end'
]);

/**
 * Checks whether company, tool, and product names in generated text are grounded
 * in either the candidate's resume or the job details (company, title, description).
 * If ungrounded entity claims are found, strips the offending sentence and reports warnings.
 */
export function checkCompanyAndToolGrounding(
  text: string,
  resumeText: string,
  jobContext: JobGroundingContext
): GroundingCheckResult {
  if (!text) {
    return { isGrounded: true, ungroundedEntities: [], sanitizedText: text, removedSentences: [] };
  }

  const allowedCorpus = [
    resumeText,
    jobContext.companyName,
    jobContext.jobTitle,
    jobContext.jobDescription,
  ].join(' ').toLowerCase();

  const sentences = splitSentences(text);
  const remainingSentences: string[] = [];
  const removedSentences: string[] = [];
  const ungroundedEntities: string[] = [];

  // Patterns for company/employer references like "at Company", "with Company", "for Company", "joining Company"
  const companyPattern = /\b(?:[aA]t|[wW]ith|[fF]or|[jJ]oining|[lL]ed at|[bB]uilt at|[sS]caled at)\s+([A-Z][a-zA-Z0-9&.\-]+(?:\s+[A-Z][a-zA-Z0-9&.\-]+)?)\b/g;

  for (const sentence of sentences) {
    let sentenceHasUngrounded = false;
    const matches = Array.from(sentence.matchAll(companyPattern));

    for (const match of matches) {
      const candidateName = match[1].trim();
      const lowerName = candidateName.toLowerCase();

      // Ignore common non-company words
      if (COMMON_NON_COMPANY_WORDS.has(lowerName)) {
        continue;
      }

      // Check if candidate name exists in allowed corpus (resume + JD + company)
      if (!allowedCorpus.includes(lowerName)) {
        sentenceHasUngrounded = true;
        if (!ungroundedEntities.includes(candidateName)) {
          ungroundedEntities.push(candidateName);
        }
      }
    }

    if (sentenceHasUngrounded) {
      removedSentences.push(sentence);
    } else {
      remainingSentences.push(sentence);
    }
  }

  const isGrounded = ungroundedEntities.length === 0;
  const sanitizedText = isGrounded ? text : remainingSentences.join(' ');

  return {
    isGrounded,
    ungroundedEntities,
    sanitizedText,
    removedSentences,
  };
}

/**
 * Anti-fabrication check comparing quantitative metrics against resume.
 */
export function checkAntiFabrication(
  generatedText: string,
  resumeText: string
): string[] {
  const warnings: string[] = [];
  if (!generatedText || !resumeText) return warnings;

  const resumeLower = resumeText.toLowerCase();

  // Find percentage / dollar metrics (e.g., $10M, 45%, 200k)
  const metricRegex = /(?:\$\d+(?:\.\d+)?(?:k|m|b|M|B)?|\b\d+(?:\.\d+)?%|\b\d+(?:k|m|b|M|B)\+?)/g;
  const generatedMetrics = Array.from(generatedText.matchAll(metricRegex), (m) => m[0]);

  for (const metric of generatedMetrics) {
    if (!resumeLower.includes(metric.toLowerCase())) {
      warnings.push(`Metric "${metric}" does not appear explicitly in resume text.`);
    }
  }

  return warnings;
}

/**
 * Runs full validation on generated cover note and referral message.
 */
export function validateOutreachCopy(
  coverNote: string,
  referralMessage: string,
  resumeText: string,
  jobContext: JobGroundingContext
): ValidationResult {
  const clichesFound = [
    ...findCliches(coverNote),
    ...findCliches(referralMessage),
  ];

  const fabricationWarnings = [
    ...checkAntiFabrication(coverNote, resumeText),
    ...checkAntiFabrication(referralMessage, resumeText),
  ];

  const coverGrounding = checkCompanyAndToolGrounding(coverNote, resumeText, jobContext);
  const referralGrounding = checkCompanyAndToolGrounding(referralMessage, resumeText, jobContext);

  if (!coverGrounding.isGrounded) {
    for (const entity of coverGrounding.ungroundedEntities) {
      fabricationWarnings.push(`Company/product "${entity}" is not in resume or JD. Offending sentence removed.`);
    }
  }

  if (!referralGrounding.isGrounded) {
    for (const entity of referralGrounding.ungroundedEntities) {
      fabricationWarnings.push(`Company/product "${entity}" in referral message is not in resume or JD. Offending sentence removed.`);
    }
  }

  const sanitizedCoverNote = coverGrounding.sanitizedText;
  const sanitizedReferralMessage = referralGrounding.sanitizedText;

  const coverNoteWordCount = countWords(sanitizedCoverNote);
  const referralMessageWordCount = countWords(sanitizedReferralMessage);

  const isCoverLengthValid = coverNoteWordCount >= 130 && coverNoteWordCount <= 170;
  const isReferralLengthValid = referralMessageWordCount < 90 && referralMessageWordCount >= 10;
  const isLengthValid = isCoverLengthValid && isReferralLengthValid;

  const isValid =
    clichesFound.length === 0 &&
    coverGrounding.isGrounded &&
    referralGrounding.isGrounded &&
    isLengthValid;

  return {
    isValid,
    clichesFound,
    fabricationWarnings,
    isLengthValid,
    coverNoteWordCount,
    referralMessageWordCount,
    sanitizedCoverNote,
    sanitizedReferralMessage,
  };
}
