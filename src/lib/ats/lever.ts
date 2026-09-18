import { RawJobPosting } from './types';

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl?: string;
  applyUrl?: string;
  categories?: {
    location?: string;
    commitment?: string;
    team?: string;
    allLocations?: string[];
  };
  description?: string;
  descriptionPlain?: string;
  additional?: string;
  additionalPlain?: string;
  lists?: Array<{
    text: string;
    content: string;
  }>;
}

export async function fetchLeverJobs(
  companySlug: string,
  companyName: string
): Promise<RawJobPosting[]> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(companySlug)}?mode=json`;

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to fetch Lever board for "${companySlug}" (HTTP ${res.status}: ${res.statusText})`
    );
  }

  const postings: LeverPosting[] = await res.json();

  return (Array.isArray(postings) ? postings : []).map((job) => {
    const locCategory = job.categories?.location || '';
    const allLocs = job.categories?.allLocations || [];
    const locationStr =
      allLocs.length > 0 ? allLocs.join(', ') : locCategory || 'Unspecified';

    let fullDescription = job.description || job.descriptionPlain || '';
    if (job.lists && Array.isArray(job.lists)) {
      const listsText = job.lists
        .map((l) => `\n\n${l.text}\n${l.content}`)
        .join('');
      fullDescription += listsText;
    }
    if (job.additional) {
      fullDescription += `\n\n${job.additional}`;
    }

    return {
      externalId: job.id,
      title: job.text || '',
      companyName: companyName,
      location: locationStr,
      url: job.hostedUrl || job.applyUrl || '',
      rawDescription: fullDescription,
    };
  });
}
