import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { TrackerBoard, ApplicationRecord } from '@/components/TrackerBoard';

export const dynamic = 'force-dynamic';

export default async function TrackerPage() {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: applications, error } = await supabase
    .from('applications')
    .select('*, jobs(*)')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Failed to load applications in TrackerPage:', error);
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '1rem auto 3rem' }}>
      <TrackerBoard initialApplications={(applications as ApplicationRecord[]) || []} />
    </div>
  );
}
