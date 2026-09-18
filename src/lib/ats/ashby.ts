import { RawJobPosting } from './types';

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: Array<{
    location?: string;
  }>;
  isRemote?: boolean;
  jobUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
}

interface AshbyResponse {
  jobs?: AshbyJob[];
}

export async function fetchAshbyJobs(
  companySlug: string,
  companyName: string
): Promise<RawJobPosting[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(companySlug)}`;

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to fetch Ashby board for "${companySlug}" (HTTP ${res.status}: ${res.statusText})`
    );
  }

  const data: AshbyResponse = await res.json();
  const jobs = data.jobs || [];

  return jobs.map((job) => {
    const locs: string[] = [];
    if (job.location) locs.push(job.location);
    if (job.secondaryLocations) {
      job.secondaryLocations.forEach((sec) => {
        if (sec.location) locs.push(sec.location);
      });
    }
    if (job.isRemote && !locs.some((l) => /remote/i.test(l))) {
      locs.push('Remote');
    }

    const locationStr = locs.length > 0 ? locs.join(', ') : 'Unspecified';
    const description = job.descriptionHtml || job.descriptionPlain || '';

    return {
      externalId: job.id,
      title: job.title || '',
      companyName: companyName,
      location: locationStr,
      url: job.jobUrl || '',
      rawDescription: description,
    };
  });
}
