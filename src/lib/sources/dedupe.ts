export interface ApplyOption {
  publisher: string;
  apply_link: string;
  is_direct?: boolean;
}

export interface ExistingJobDedupeRecord {
  id: string;
  job_url: string;
  external_id?: string | null;
  company_name: string;
  title: string;
  created_at: string;
}

const COMPANY_SUFFIX_REGEX = /\b(pvt|ltd|private|limited|inc|incorporated|llc|corp|corporation|technologies|technology|tech|labs|lab|india|software|solutions|services|co|group|holdings|enterprises)\b/gi;

/**
 * Normalizes a company name for cross-source fuzzy deduplication.
 * Example: "Razorpay Software Pvt Ltd" -> "razorpay"
 */
export function normalizeCompanyName(company: string): string {
  if (!company) return '';
  return company
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(COMPANY_SUFFIX_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes a job title for cross-source fuzzy deduplication.
 * Example: "Associate Product Manager - Remote (India)" -> "associate product manager"
 */
export function normalizeJobTitle(title: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(remote|india|bangalore|bengaluru|mumbai|delhi|gurgaon|gurugram|pune|hyderabad|chennai|noida|wfh|hybrid|full time|fulltime)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if a candidate job is a cross-source duplicate of any existing database jobs.
 * 
 * Rules:
 * 1. URL exact match.
 * 2. External ID (JSearch job_id) match.
 * 3. Same normalized company name + normalized title within 14 days (14 * 24 * 60 * 60 * 1000 ms).
 */
export function isJobDuplicate(
  candidate: {
    job_url: string;
    external_id?: string | null;
    company_name: string;
    title: string;
    created_at?: string;
  },
  existingJobs: ExistingJobDedupeRecord[],
  referenceDate: Date = new Date()
): { isDuplicate: boolean; reason?: string } {
  const candidateUrl = (candidate.job_url || '').trim();
  const candidateExtId = (candidate.external_id || '').trim();
  const candidateNormCompany = normalizeCompanyName(candidate.company_name);
  const candidateNormTitle = normalizeJobTitle(candidate.title);

  const DEDUPE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

  for (const existing of existingJobs) {
    // 1. Exact URL Match
    if (candidateUrl && existing.job_url && candidateUrl === existing.job_url.trim()) {
      return { isDuplicate: true, reason: 'Duplicate job URL' };
    }

    // 2. Exact External ID Match
    if (candidateExtId && existing.external_id && candidateExtId === existing.external_id.trim()) {
      return { isDuplicate: true, reason: 'Duplicate external_id' };
    }

    // 3. 14-Day Same Company + Same Normalized Title Match
    if (candidateNormCompany && candidateNormTitle) {
      const existingNormCompany = normalizeCompanyName(existing.company_name);
      const existingNormTitle = normalizeJobTitle(existing.title);

      if (
        candidateNormCompany === existingNormCompany &&
        candidateNormTitle === existingNormTitle
      ) {
        const existingCreatedTime = new Date(existing.created_at).getTime();
        const refTime = referenceDate.getTime();
        const diffMs = Math.abs(refTime - existingCreatedTime);

        if (diffMs <= DEDUPE_WINDOW_MS) {
          return {
            isDuplicate: true,
            reason: `Cross-source duplicate: same company "${existing.company_name}" and title within 14 days`,
          };
        }
      }
    }
  }

  return { isDuplicate: false };
}
