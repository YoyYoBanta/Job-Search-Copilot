import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { JobsList, JobRecord } from '@/components/JobsList';

export const dynamic = 'force-dynamic';

export default async function JobsPage() {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: jobs } = await supabase
    .from('jobs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <div style={{ maxWidth: '1000px', margin: '1rem auto 3rem' }}>
      <JobsList initialJobs={(jobs as JobRecord[]) || []} />
    </div>
  );
}
