export interface PreFilterJobCandidate {
  title: string;
  description?: string;
  postedAt?: string | number | null;
  requiredExperienceYears?: number | null;
  seniorityLevel?: string | null;
}

export interface PreFilterResult {
  passed: boolean;
  reason?: string;
}

const BLOCKED_SENIORITY_LEVELS = new Set([
  'senior',
  'lead',
  'director',
  'executive',
  'principal',
  'staff',
  'vp',
  'head',
  'chief',
]);

const BLOCKED_TITLE_SENIORITY_REGEX = /\b(senior|sr\.?|lead|director|vp|vice president|head of|principal|staff|executive|chief)\b/i;

const HIGH_EXPERIENCE_REGEX = /\b(6|7|8|9|10|11|12|13|14|15|\d{2})\+?\s*(?:-\s*\d+\s*|to\s+\d+\s*)?(?:years?|yrs?)\s*(?:of\s+)?(?:experience|exp)\b/i;

const CUTOFF_21_DAYS_MS = 21 * 24 * 60 * 60 * 1000;

/**
 * Pre-filters candidate jobs (primarily JSearch) at ingestion time before saving to database.
 * 
 * Rejection criteria:
 * 1. Required experience >= 6 years.
 * 2. Seniority level in (senior, lead, director, executive, principal, staff, vp, head).
 * 3. Posted date is older than 21 days.
 */
export function evaluateScoringPreFilter(
  candidate: PreFilterJobCandidate,
  referenceDate: Date = new Date()
): PreFilterResult {
  const title = (candidate.title || '').trim();

  // 1. Check explicit seniority level field
  if (candidate.seniorityLevel) {
    const normSeniority = candidate.seniorityLevel.toLowerCase().trim();
    if (BLOCKED_SENIORITY_LEVELS.has(normSeniority)) {
      return {
        passed: false,
        reason: `Blocked seniority level: "${candidate.seniorityLevel}"`,
      };
    }
  }

  // 2. Check title for senior / lead / executive keywords
  if (BLOCKED_TITLE_SENIORITY_REGEX.test(title)) {
    return {
      passed: false,
      reason: `Title contains senior role keyword`,
    };
  }

  // 3. Check explicit required experience years
  if (typeof candidate.requiredExperienceYears === 'number' && candidate.requiredExperienceYears >= 6) {
    return {
      passed: false,
      reason: `Required experience is ${candidate.requiredExperienceYears} years (limit is < 6 years)`,
    };
  }

  // 4. Check description for high experience requirements (e.g. "7+ years of experience")
  if (candidate.description && HIGH_EXPERIENCE_REGEX.test(candidate.description)) {
    return {
      passed: false,
      reason: 'Job description requires 6+ years of experience',
    };
  }

  // 5. Check 21-day posting age cutoff
  if (candidate.postedAt) {
    const postedTime =
      typeof candidate.postedAt === 'number'
        ? (candidate.postedAt > 1e11 ? candidate.postedAt : candidate.postedAt * 1000)
        : new Date(candidate.postedAt).getTime();

    if (!isNaN(postedTime)) {
      const ageMs = referenceDate.getTime() - postedTime;
      if (ageMs > CUTOFF_21_DAYS_MS) {
        return {
          passed: false,
          reason: `Job was posted more than 21 days ago (${Math.floor(ageMs / (24 * 60 * 60 * 1000))} days old)`,
        };
      }
    }
  }

  return { passed: true };
}
