export type BoardType = 'greenhouse' | 'lever' | 'ashby';

export interface RawJobPosting {
  externalId: string;
  title: string;
  companyName: string;
  location: string;
  url: string;
  rawDescription: string;
}

export interface CompanyRecord {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  board_type: BoardType;
  created_at: string;
  updated_at: string;
}

export interface IngestionMetrics {
  companyName: string;
  companySlug: string;
  boardType: BoardType;
  totalFetched: number;
  passedFilter: number;
  newInserted: number;
  duplicatesCount: number;
  error?: string;
}
