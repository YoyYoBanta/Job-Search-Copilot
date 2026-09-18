import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ResumeEditor } from '@/components/ResumeEditor';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('resume_text, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  return (
    <div style={{ maxWidth: '900px', margin: '1rem auto 3rem' }}>
      <ResumeEditor
        initialResumeText={profile?.resume_text || ''}
        initialUpdatedAt={profile?.updated_at || null}
      />
    </div>
  );
}
