import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ResumeEditor } from '@/components/ResumeEditor';
import { FiltersEditor } from '@/components/FiltersEditor';
import { ensureUserOnboarded } from '@/lib/onboarding';
import {
  DEFAULT_INCLUDE_TITLES,
  DEFAULT_EXCLUDE_TITLES,
  DEFAULT_ALLOWED_LOCATIONS,
  DEFAULT_ALLOW_REMOTE,
} from '@/config/filters';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await requireAuth();
  const supabase = await createClient();

  // Ensure user profile, filters, and queries are initialized
  await ensureUserOnboarded(supabase, user.id, user.email);

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, resume_text, total_years_experience, pm_years_experience, target_roles, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: userFilters } = await supabase
    .from('user_filters')
    .select('include_titles, exclude_titles, allowed_locations, allow_remote, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  return (
    <div style={{ maxWidth: '900px', margin: '1rem auto 3rem' }}>
      <ResumeEditor
        initialDisplayName={profile?.display_name || null}
        initialResumeText={profile?.resume_text || ''}
        initialTotalYears={profile?.total_years_experience !== undefined && profile?.total_years_experience !== null ? Number(profile.total_years_experience) : 0}
        initialPmYears={profile?.pm_years_experience !== undefined && profile?.pm_years_experience !== null ? Number(profile.pm_years_experience) : 0}
        initialTargetRoles={Array.isArray(profile?.target_roles) ? profile.target_roles : ['APM', 'Product Manager']}
        initialUpdatedAt={profile?.updated_at || null}
      />

      <FiltersEditor
        initialIncludeTitles={userFilters?.include_titles || [...DEFAULT_INCLUDE_TITLES]}
        initialExcludeTitles={userFilters?.exclude_titles || [...DEFAULT_EXCLUDE_TITLES]}
        initialAllowedLocations={userFilters?.allowed_locations || [...DEFAULT_ALLOWED_LOCATIONS]}
        initialAllowRemote={userFilters?.allow_remote !== undefined ? userFilters.allow_remote : DEFAULT_ALLOW_REMOTE}
        initialUpdatedAt={userFilters?.updated_at || null}
      />
    </div>
  );
}
