/**
 * Centralized Job Filtering Configuration
 * Rules from context.md Section 7 & Phase 2 specifications:
 * - Whole-word / token matching for all terms.
 * - 'IN' is case-sensitive (uppercase only country code).
 * - Title must contain an included product role and NO excluded senior role.
 * - Location must be in approved India cities, India, or eligible Remote.
 */

export interface UserFiltersConfig {
  include_titles?: string[];
  exclude_titles?: string[];
  allowed_locations?: string[];
  allow_remote?: boolean;
}

export const DEFAULT_INCLUDE_TITLES = [
  'Product Manager',
  'APM',
  'Associate Product',
  'Product Owner',
  'Product Analyst',
] as const;

export const DEFAULT_EXCLUDE_TITLES = [
  'Director',
  'Head of',
  'VP',
  'Principal',
  'Group Product',
  'Staff',
] as const;

export const DEFAULT_ALLOWED_LOCATIONS = [
  'India',
  'Bangalore',
  'Bengaluru',
  'Mumbai',
  'Pune',
  'Gurgaon',
  'Gurugram',
  'Delhi',
  'New Delhi',
  'Noida',
  'Hyderabad',
  'Chennai',
] as const;

export const DEFAULT_ALLOW_REMOTE = true;

// Aliases for backwards compatibility
export const TITLE_INCLUSIONS = DEFAULT_INCLUDE_TITLES;
export const TITLE_EXCLUSIONS = DEFAULT_EXCLUDE_TITLES;
export const APPROVED_INDIA_LOCATIONS = DEFAULT_ALLOWED_LOCATIONS;

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks if text contains any of the search phrases matching whole words.
 */
function containsWholePhrase(text: string, phrase: string, caseSensitive: boolean = false): boolean {
  if (!phrase || !phrase.trim()) return false;
  const escaped = escapeRegex(phrase.trim()).replace(/\s+/g, '\\s+');
  const regex = new RegExp(`\\b${escaped}\\b`, caseSensitive ? '' : 'i');
  return regex.test(text);
}

export interface FilterResult {
  passed: boolean;
  titleMatch: boolean;
  locationMatch: boolean;
  needsEligibilityCheck: boolean;
  reason?: string;
}

/**
 * Evaluates a job's title against inclusion and exclusion rules.
 */
export function evaluateTitle(
  title: string,
  config?: UserFiltersConfig
): { matched: boolean; reason?: string } {
  if (!title || !title.trim()) {
    return { matched: false, reason: 'Empty title' };
  }

  const exclusions = config?.exclude_titles ?? DEFAULT_EXCLUDE_TITLES;
  const inclusions = config?.include_titles ?? DEFAULT_INCLUDE_TITLES;

  // 1. Check title exclusions first (Director, VP, Staff, etc.)
  for (const exclusion of exclusions) {
    if (containsWholePhrase(title, exclusion, false)) {
      return {
        matched: false,
        reason: `Title excluded by seniority term: "${exclusion}"`,
      };
    }
  }

  // 2. Check title inclusions (Product Manager, APM, etc.)
  for (const inclusion of inclusions) {
    if (containsWholePhrase(title, inclusion, false)) {
      return { matched: true };
    }
  }

  return {
    matched: false,
    reason: 'Title does not match any included product roles',
  };
}

/**
 * Evaluates a job's location against approved locations and remote eligibility rules.
 */
export function evaluateLocation(
  location: string,
  config?: UserFiltersConfig
): {
  matched: boolean;
  needsEligibilityCheck: boolean;
  reason?: string;
} {
  if (!location || !location.trim()) {
    return {
      matched: false,
      needsEligibilityCheck: false,
      reason: 'Empty location',
    };
  }

  const loc = location.trim();
  const allowedLocations = config?.allowed_locations ?? DEFAULT_ALLOWED_LOCATIONS;
  const allowRemote = config?.allow_remote ?? DEFAULT_ALLOW_REMOTE;

  // 1. Check explicit approved locations or standalone uppercase IN country code
  const isApprovedCity = allowedLocations.some((city) =>
    containsWholePhrase(loc, city, false)
  );
  const isUppercaseIN = /\bIN\b/.test(loc);

  if (isApprovedCity || isUppercaseIN) {
    return {
      matched: true,
      needsEligibilityCheck: false,
    };
  }

  // 2. Check Remote roles
  const isRemote =
    /\bremote\b/i.test(loc) ||
    /\bwork from anywhere\b/i.test(loc) ||
    /\banywhere\b/i.test(loc);

  if (isRemote) {
    if (!allowRemote) {
      return {
        matched: false,
        needsEligibilityCheck: false,
        reason: 'Remote roles are disabled in user filters',
      };
    }

    // Check if the remote location names specific cities/countries/regions outside approved locations
    // Strip generic global/remote descriptor tokens and punctuation
    const remainder = loc
      .replace(
        /\b(work from anywhere|work from home|fully remote|worldwide|distributed|flexible|anywhere|optional|remote|global|wfh|home|and|or)\b/gi,
        ''
      )
      .replace(/[,\-\/\(\)\[\]&|•\s]/g, '')
      .trim();

    // If there is leftover text naming specific foreign cities/countries (and no approved location),
    // treat as region-restricted remote and EXCLUDE (Bug 2 fix).
    if (remainder.length > 0) {
      return {
        matched: false,
        needsEligibilityCheck: false,
        reason: `Remote role is region-restricted to non-India locations (${loc})`,
      };
    }

    // Pure country-less Remote (e.g. "Remote", "Remote - Global", "Remote (Worldwide)", "Anywhere")
    return {
      matched: true,
      needsEligibilityCheck: true, // Flag with "Check eligibility" badge
    };
  }

  return {
    matched: false,
    needsEligibilityCheck: false,
    reason: 'Location does not match approved locations, approved remote, or IN token',
  };
}

/**
 * Main evaluation function combining title and location filtering.
 */
export function evaluateJobFilter(
  title: string,
  location: string,
  config?: UserFiltersConfig
): FilterResult {
  const titleResult = evaluateTitle(title, config);
  const locationResult = evaluateLocation(location, config);

  const passed = titleResult.matched && locationResult.matched;

  let reason: string | undefined;
  if (!titleResult.matched) {
    reason = titleResult.reason;
  } else if (!locationResult.matched) {
    reason = locationResult.reason;
  }

  return {
    passed,
    titleMatch: titleResult.matched,
    locationMatch: locationResult.matched,
    needsEligibilityCheck: locationResult.needsEligibilityCheck,
    reason,
  };
}
