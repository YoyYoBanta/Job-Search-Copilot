import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
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

  const hasResume = Boolean(profile?.resume_text?.trim());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Welcome Card */}
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(18, 24, 36, 0.9), rgba(26, 34, 51, 0.9))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span className="badge badge-emerald">Phase 1 Active</span>
              <span className="badge badge-amber">Single-User</span>
            </div>
            <h1 className="card-title" style={{ fontSize: '1.75rem' }}>
              Welcome back, {user.email}
            </h1>
            <p className="card-desc" style={{ maxWidth: '650px', marginTop: '0.5rem' }}>
              Your personal Job Search Copilot is initialized and secure. Configure your profile resume below to power the ATS matcher and outreach tailor.
            </p>
          </div>

          <Link href="/profile" className="btn btn-primary">
            {hasResume ? 'Edit Profile & Resume' : 'Paste Your Resume →'}
          </Link>
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
          <p style={{ fontSize: '0.875rem', marginBottom: '1.25rem' }}>
            {hasResume
              ? `Stored in Supabase (last updated ${new Date(profile!.updated_at).toLocaleDateString()}).`
              : 'No resume found. Paste your resume text once to enable match scoring.'}
          </p>
          <Link href="/profile" className="btn btn-secondary" style={{ width: '100%' }}>
            Manage Resume
          </Link>
        </div>

        {/* ATS Ingestion Preview */}
        <div className="card" style={{ opacity: 0.85 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <h3 className="card-title" style={{ fontSize: '1.125rem' }}>Job Feeds & Filter</h3>
            <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
              Phase 2
            </span>
          </div>
          <p style={{ fontSize: '0.875rem' }}>
            Automated public board ingestion (Greenhouse, Lever, Ashby) with India/Remote whole-word filtering.
          </p>
        </div>

        {/* AI Matcher Preview */}
        <div className="card" style={{ opacity: 0.85 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <h3 className="card-title" style={{ fontSize: '1.125rem' }}>AI Matcher</h3>
            <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
              Phase 3
            </span>
          </div>
          <p style={{ fontSize: '0.875rem' }}>
            Single-job sequential Groq scoring queue with strict JSON schema, 429 backoff, and feedback rating.
          </p>
        </div>

        {/* Tracker Preview */}
        <div className="card" style={{ opacity: 0.85 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <h3 className="card-title" style={{ fontSize: '1.125rem' }}>Pipeline Tracker</h3>
            <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
              Phase 5
            </span>
          </div>
          <p style={{ fontSize: '0.875rem' }}>
            Kanban board tracking application stages (Found to Offer), notes, and pipeline metrics.
          </p>
        </div>
      </div>
    </div>
  );
}
