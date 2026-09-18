import { FORBIDDEN_CLICHES } from './prompts';

export interface ValidationResult {
  isValid: boolean;
  clichesFound: string[];
  fabricationWarnings: string[];
  coverNoteWordCount: number;
  referralMessageWordCount: number;
}

/**
 * Counts words in a string.
 */
export function countWords(text: string): number {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Detects presence of forbidden corporate clichés.
 */
export function findCliches(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const cliche of FORBIDDEN_CLICHES) {
    if (lower.includes(cliche.toLowerCase())) {
      found.push(cliche);
    }
  }
  return found;
}

/**
 * Basic anti-fabrication check comparing key quantitative claims against resume.
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
  resumeText: string
): ValidationResult {
  const clichesFound = [
    ...findCliches(coverNote),
    ...findCliches(referralMessage),
  ];

  const fabricationWarnings = [
    ...checkAntiFabrication(coverNote, resumeText),
    ...checkAntiFabrication(referralMessage, resumeText),
  ];

  const coverNoteWordCount = countWords(coverNote);
  const referralMessageWordCount = countWords(referralMessage);

  return {
    isValid: clichesFound.length === 0,
    clichesFound,
    fabricationWarnings,
    coverNoteWordCount,
    referralMessageWordCount,
  };
}
