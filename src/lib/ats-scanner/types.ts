export type TermImportance = 'required' | 'preferred';
export type TermCategory = 'hard_skill' | 'tool' | 'domain' | 'soft_skill';

export interface ExtractedTerm {
  term: string;
  importance: TermImportance;
  category: TermCategory;
}

export interface MatchedTerm extends ExtractedTerm {
  found_in_resume: string;
}

export interface AddWordSuggestion {
  term: string;
  importance: TermImportance;
  category: TermCategory;
  reason: string;
  supporting_resume_bullet: string;
  suggested_rewrite?: string;
  rewrite_verified?: boolean;
}

export interface DoNotClaimTerm {
  term: string;
  importance: TermImportance;
  category: TermCategory;
  reason: string;
}

export interface TitleAlignment {
  current_title: string;
  target_title: string;
  suggested_headline: string;
  rationale: string;
}

export interface AtsCoverageBreakdown {
  overall_percentage: number;
  required_matched: number;
  required_total: number;
  preferred_matched: number;
  preferred_total: number;
}

export interface AtsScanResult {
  coverage: AtsCoverageBreakdown;
  matched_terms: MatchedTerm[];
  missing_terms: {
    add_these_words: AddWordSuggestion[];
    do_not_claim: DoNotClaimTerm[];
  };
  title_alignment: TitleAlignment;
  resume_fingerprint: string;
  scanned_at: string;
  model_used: string;
}
