import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { LocalTime } from '@/components/LocalTime';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('resume_text, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  const { count: companiesCount } = await supabase
    .from('companies')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  const { count: jobsCount } = await supabase
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('dismissed', false);

  const hasResume = Boolean(profile?.resume_text?.trim());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Welcome Card */}
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(18, 24, 36, 0.9), rgba(26, 34, 51, 0.9))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span className="badge badge-emerald">Phase 4 Active</span>
              <span className="badge badge-amber">Single-User</span>
            </div>
            <h1 className="card-title" style={{ fontSize: '1.75rem' }}>
              Welcome back, {user.email}
            </h1>
            <p className="card-desc" style={{ maxWidth: '650px', marginTop: '0.5rem' }}>
              Your personal Job Search Copilot is active. Target companies, job feeds, and AI fit matcher are ready to evaluate opportunities.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link href="/companies" className="btn btn-secondary">
              Target Companies ({companiesCount || 0})
            </Link>
            <Link href="/jobs" className="btn btn-primary">
              View Ingested Jobs ({jobsCount || 0})
            </Link>
          </div>
        </div>
      </div>

      {/* Grid of Modules */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        {/* Profile Card */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <h3 className="card-title" style={{ fontSize: '1.125rem' }}>My Profile</h3>
            {hasResume ? (
              <span className="badge badge-emerald">Configured</span>
            ) : (
              <span className="badge badge-amber">Needs Setup</span>
            )}
          </div>
          <p style={{ fontSize: '0.875rem', marginBottom: '1.25rem', color: 'var(--text-secondary)' }}>
            {hasResume ? (
              <>
                Stored in Supabase (last updated{' '}
                <LocalTime isoDate={profile!.updated_at} format="date" />).
              </>
            ) : (
              'No resume found. Paste your resume text once to enable match scoring.'
            )}
          </p>
          <Link href="/profile" className="btn btn-secondary" style={{ width: '100%', textAlign: 'center' }}>
            Manage Resume
          </Link>
        </div>

        {/* ATS Ingestion Card */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <h3 className="card-title" style={{ fontSize: '1.125rem' }}>Job Feeds & Filter</h3>
            <span className="badge badge-emerald">Active</span>
          </div>
          <p style={{ fontSize: '0.875rem', marginBottom: '1.25rem', color: 'var(--text-secondary)' }}>
            {companiesCount || 0} target companies configured • {jobsCount || 0} active jobs ingested.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Link href="/companies" className="btn btn-secondary" style={{ flex: 1, textAlign: 'center' }}>
              Companies
            </Link>
            <Link href="/jobs/paste" className="btn btn-secondary" style={{ flex: 1, textAlign: 'center' }}>
              Paste Job
            </Link>
          </div>
        </div>

        {/* AI Matcher Active Card */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <h3 className="card-title" style={{ fontSize: '1.125rem' }}>AI Matcher</h3>
            <span className="badge badge-emerald">
              Phase 3 Active
            </span>
          </div>
          <p style={{ fontSize: '0.875rem', marginBottom: '1.25rem', color: 'var(--text-secondary)' }}>
            Sequential Groq scoring with seniority matcher, anti-fabrication bullet verification, and feedback.
          </p>
          <Link href="/jobs" className="btn btn-primary" style={{ width: '100%', textAlign: 'center' }}>
            ⚡ Score Jobs
          </Link>
        </div>

        {/* Tracker Preview Card */}
        <div className="card" style={{ opacity: 0.85 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <h3 className="card-title" style={{ fontSize: '1.125rem' }}>Pipeline Tracker</h3>
            <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
              Phase 5
            </span>
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Kanban board tracking application stages (Found to Offer), notes, and pipeline metrics.
          </p>
        </div>
      </div>
    </div>
  );
}
