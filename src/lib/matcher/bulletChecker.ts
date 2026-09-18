/**
 * Anti-Fabrication Bullet Checker
 * Ensures that recommended resume bullets returned by the LLM substantially appear
 * in the user's master resume, dropping any fabricated or hallucinated bullets.
 */

function normalizeText(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Checks if a candidate bullet is substantially present in the resume text.
 */
export function isBulletInResume(bullet: string, resumeText: string): boolean {
  if (!bullet || !bullet.trim() || !resumeText || !resumeText.trim()) {
    return false;
  }

  const normResume = normalizeText(resumeText);
  const normBullet = normalizeText(bullet);

  // 1. Direct substring check
  if (normResume.includes(normBullet)) {
    return true;
  }

  // 2. Significant words intersection check
  const bulletWords = normBullet
    .split(' ')
    .filter((w) => w.length >= 3); // Ignore small noise words

  if (bulletWords.length === 0) {
    return false;
  }

  let matchCount = 0;
  for (const word of bulletWords) {
    if (normResume.includes(word)) {
      matchCount++;
    }
  }

  const matchRatio = matchCount / bulletWords.length;
  // If at least 70% of significant words exist in the resume, accept it
  return matchRatio >= 0.7;
}

/**
 * Filters an array of recommended bullets, keeping only those verified against the user's resume.
 */
export function filterVerbatimBullets(
  recommendedBullets: string[],
  resumeText: string
): string[] {
  if (!Array.isArray(recommendedBullets) || recommendedBullets.length === 0) {
    return [];
  }

  return recommendedBullets.filter((bullet) =>
    isBulletInResume(bullet, resumeText)
  );
}
