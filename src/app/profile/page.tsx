import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ResumeEditor } from '@/components/ResumeEditor';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('resume_text, total_years_experience, pm_years_experience, target_roles, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  return (
    <div style={{ maxWidth: '900px', margin: '1rem auto 3rem' }}>
      <ResumeEditor
        initialResumeText={profile?.resume_text || ''}
        initialTotalYears={profile?.total_years_experience !== undefined && profile?.total_years_experience !== null ? Number(profile.total_years_experience) : 0}
        initialPmYears={profile?.pm_years_experience !== undefined && profile?.pm_years_experience !== null ? Number(profile.pm_years_experience) : 0}
        initialTargetRoles={Array.isArray(profile?.target_roles) ? profile.target_roles : ['APM', 'Product Manager']}
        initialUpdatedAt={profile?.updated_at || null}
      />
    </div>
  );
}
