export interface CandidateJobUrlItem {
  url: string;
  [key: string]: any;
}

/**
 * Filters out job postings whose URLs already exist in the database (including dismissed jobs).
 */
export function filterNewCandidateJobs<T extends CandidateJobUrlItem>(
  candidateJobs: T[],
  existingUrlsInDatabase: string[]
): { newJobs: T[]; duplicatesCount: number } {
  const existingUrlSet = new Set(existingUrlsInDatabase.map((u) => u.trim()));
  const newJobs = candidateJobs.filter((job) => !existingUrlSet.has(job.url.trim()));
  return {
    newJobs,
    duplicatesCount: candidateJobs.length - newJobs.length,
  };
}
