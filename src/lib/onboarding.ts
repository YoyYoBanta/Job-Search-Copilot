import { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_INCLUDE_TITLES,
  DEFAULT_EXCLUDE_TITLES,
  DEFAULT_ALLOWED_LOCATIONS,
  DEFAULT_ALLOW_REMOTE,
  UserFiltersConfig,
} from '@/config/filters';

export const DEFAULT_SEARCH_QUERIES = [
  { query: 'Associate Product Manager in India', country: 'in', date_posted: 'week', enabled: true },
  { query: 'Product Manager remote India', country: 'in', date_posted: 'week', enabled: true },
  { query: 'APM Bengaluru', country: 'in', date_posted: 'week', enabled: true },
];

/**
 * Checks whether an array of title strings matches the default include titles.
 */
export function areIncludeTitlesDefault(titles?: string[] | null): boolean {
  if (!titles || !Array.isArray(titles)) return false;
  if (titles.length !== DEFAULT_INCLUDE_TITLES.length) return false;
  const sortedA = [...titles].map((t) => t.trim().toLowerCase()).sort();
  const sortedB = [...DEFAULT_INCLUDE_TITLES].map((t) => t.trim().toLowerCase()).sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

/**
 * Ensures a user is fully onboarded with profile, default filters, and conditional search queries.
 * Idempotent: Safe to call repeatedly on auth or cron runs.
 */
export async function ensureUserOnboarded(
  supabase: SupabaseClient,
  userId: string,
  userEmail?: string | null,
  displayName?: string | null
): Promise<{
  profileCreated: boolean;
  filtersCreated: boolean;
  queriesCreated: boolean;
}> {
  let profileCreated = false;
  let filtersCreated = false;
  let queriesCreated = false;

  const resolvedDisplayName =
    displayName ||
    (userEmail ? userEmail.split('@')[0] : 'User');

  // 1. Ensure Profile row exists
  const { data: existingProfile, error: profileErr } = await supabase
    .from('profiles')
    .select('user_id, display_name, resume_text')
    .eq('user_id', userId)
    .maybeSingle();

  if (!existingProfile && !profileErr) {
    const { error: insertProfileErr } = await supabase.from('profiles').insert({
      user_id: userId,
      display_name: resolvedDisplayName,
      target_roles: ['APM', 'Product Manager'],
      total_years_experience: 0,
      pm_years_experience: 0,
    });
    if (!insertProfileErr) {
      profileCreated = true;
    }
  }

  // 2. Ensure user_filters row exists
  const { data: existingFilters, error: filtersErr } = await supabase
    .from('user_filters')
    .select('user_id, include_titles, exclude_titles, allowed_locations, allow_remote')
    .eq('user_id', userId)
    .maybeSingle();

  let userIncludeTitles: string[] = [];

  if (!existingFilters && !filtersErr) {
    const { error: insertFiltersErr } = await supabase.from('user_filters').insert({
      user_id: userId,
      include_titles: [...DEFAULT_INCLUDE_TITLES],
      exclude_titles: [...DEFAULT_EXCLUDE_TITLES],
      allowed_locations: [...DEFAULT_ALLOWED_LOCATIONS],
      allow_remote: DEFAULT_ALLOW_REMOTE,
    });
    if (!insertFiltersErr) {
      filtersCreated = true;
      userIncludeTitles = [...DEFAULT_INCLUDE_TITLES];
    }
  } else if (existingFilters) {
    userIncludeTitles = existingFilters.include_titles || [];
  }

  // 3. Seed default search_queries ONLY if include_titles still match default inclusion titles
  if (areIncludeTitlesDefault(userIncludeTitles)) {
    const { count, error: countErr } = await supabase
      .from('search_queries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (!countErr && (count === 0 || count === null)) {
      const queriesToInsert = DEFAULT_SEARCH_QUERIES.map((q) => ({
        user_id: userId,
        query: q.query,
        country: q.country,
        date_posted: q.date_posted,
        enabled: q.enabled,
      }));

      const { error: insertQueriesErr } = await supabase
        .from('search_queries')
        .insert(queriesToInsert);

      if (!insertQueriesErr) {
        queriesCreated = true;
      }
    }
  }

  return {
    profileCreated,
    filtersCreated,
    queriesCreated,
  };
}
