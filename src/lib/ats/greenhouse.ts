import { RawJobPosting } from './types';

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: {
    name?: string;
  };
  offices?: Array<{
    name?: string;
    location?: string;
  }>;
  content?: string;
}

interface GreenhouseResponse {
  jobs?: GreenhouseJob[];
}

export async function fetchGreenhouseJobs(
  companySlug: string,
  companyName: string
): Promise<RawJobPosting[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(companySlug)}/jobs?content=true`;

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
    next: { revalidate: 0 }, // no cache
  });

  if (!res.ok) {
    throw new Error(
      `Failed to fetch Greenhouse board for "${companySlug}" (HTTP ${res.status}: ${res.statusText})`
    );
  }

  const data: GreenhouseResponse = await res.json();
  const jobs = data.jobs || [];

  return jobs.map((job) => {
    let locationStr = job.location?.name || '';
    if (!locationStr && job.offices && job.offices.length > 0) {
      locationStr = job.offices
        .map((o) => o.location || o.name || '')
        .filter(Boolean)
        .join(', ');
    }

    return {
      externalId: String(job.id),
      title: job.title || '',
      companyName: companyName,
      location: locationStr || 'Unspecified',
      url: job.absolute_url || '',
      rawDescription: job.content || '',
    };
  });
}
