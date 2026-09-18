/**
 * Centralized Job Filtering Configuration
 * Rules from context.md Section 7:
 * - Whole-word / token matching for all terms.
 * - 'IN' is case-sensitive (uppercase only country code).
 * - Title must contain an included product role and NO excluded senior role.
 * - Location must be in approved India cities, India, or eligible Remote.
 */

export const TITLE_INCLUSIONS = [
  'Product Manager',
  'APM',
  'Associate Product',
  'Product Owner',
  'Product Analyst',
] as const;

export const TITLE_EXCLUSIONS = [
  'Director',
  'Head of',
  'VP',
  'Principal',
  'Group Product',
  'Staff',
] as const;

export const APPROVED_INDIA_LOCATIONS = [
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

// Disallowed foreign regions/countries when associated with remote jobs
export const DISALLOWED_FOREIGN_REGIONS = [
  'US',
  'USA',
  'United States',
  'North America',
  'EU',
  'Europe',
  'EMEA',
  'UK',
  'United Kingdom',
  'London',
  'Germany',
  'Berlin',
  'Canada',
  'Australia',
  'Singapore',
  'Latin America',
  'LATAM',
] as const;

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks if text contains any of the search phrases matching whole words.
 */
function containsWholePhrase(text: string, phrase: string, caseSensitive: boolean = false): boolean {
  // Use word boundary \b
  const escaped = escapeRegex(phrase).replace(/\s+/g, '\\s+');
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
export function evaluateTitle(title: string): { matched: boolean; reason?: string } {
  if (!title || !title.trim()) {
    return { matched: false, reason: 'Empty title' };
  }

  // 1. Check title exclusions first (Director, VP, Staff, etc.)
  for (const exclusion of TITLE_EXCLUSIONS) {
    if (containsWholePhrase(title, exclusion, false)) {
      return {
        matched: false,
        reason: `Title excluded by seniority term: "${exclusion}"`,
      };
    }
  }

  // 2. Check title inclusions (Product Manager, APM, etc.)
  for (const inclusion of TITLE_INCLUSIONS) {
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
 * Evaluates a job's location against India approved locations and remote eligibility rules.
 */
export function evaluateLocation(location: string): {
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

  // 1. Check explicit India approved locations (case-insensitive)
  const isApprovedIndiaCity = APPROVED_INDIA_LOCATIONS.some((city) =>
    containsWholePhrase(loc, city, false)
  );

  // 2. Check case-sensitive standalone uppercase 'IN' country code token (e.g., "Bengaluru, IN")
  // Note: must match uppercase \bIN\b, never lowercase "in" (e.g. "Hybrid in London")
  const isUppercaseIN = /\bIN\b/.test(loc);

  if (isApprovedIndiaCity || isUppercaseIN) {
    return {
      matched: true,
      needsEligibilityCheck: false,
    };
  }

  // 3. Check Remote roles
  const isRemote = /\bremote\b/i.test(loc) || /\bwork from anywhere\b/i.test(loc);

  if (isRemote) {
    // Check if remote is paired with a disallowed foreign region/country (e.g. "Remote - US", "Remote (EU only)")
    for (const region of DISALLOWED_FOREIGN_REGIONS) {
      // For 'US', 'EU', 'UK', ensure case-sensitive or whole token match
      if (containsWholePhrase(loc, region, region.length <= 3)) {
        return {
          matched: false,
          needsEligibilityCheck: false,
          reason: `Remote role restricted to excluded region: "${region}"`,
        };
      }
    }

    // Check if remote is explicitly paired with India or APAC
    const isIndiaOrApac =
      APPROVED_INDIA_LOCATIONS.some((city) => containsWholePhrase(loc, city, false)) ||
      /\bIN\b/.test(loc) ||
      /\bAPAC\b/i.test(loc);

    if (isIndiaOrApac) {
      return {
        matched: true,
        needsEligibilityCheck: false,
      };
    }

    // General / country-less Remote (e.g. "Remote", "Remote - Global", "Worldwide")
    return {
      matched: true,
      needsEligibilityCheck: true, // Flag with "Check eligibility" badge
    };
  }

  return {
    matched: false,
    needsEligibilityCheck: false,
    reason: 'Location does not match India cities, approved remote, or IN token',
  };
}

/**
 * Main evaluation function combining title and location filtering.
 */
export function evaluateJobFilter(title: string, location: string): FilterResult {
  const titleResult = evaluateTitle(title);
  const locationResult = evaluateLocation(location);

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
