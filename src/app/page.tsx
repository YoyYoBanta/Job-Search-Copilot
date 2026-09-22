import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { LocalTime } from '@/components/LocalTime';
import { ensureUserOnboarded } from '@/lib/onboarding';
import { getRapidApiMonthlyUsage, getRapidApiMonthlyCap } from '@/lib/cron/budget';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await requireAuth();
  const supabase = await createClient();

  // Ensure user is onboarded
  await ensureUserOnboarded(supabase, user.id, user.email);

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, resume_text, updated_at')
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

  const { count: applicationsCount } = await supabase
    .from('applications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  const { data: lastCronRun } = await supabase
    .from('cron_runs')
    .select('*')
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // RapidAPI Monthly Cap & Usage across all users
  const monthlyUsage = await getRapidApiMonthlyUsage(supabase);
  const monthlyCap = getRapidApiMonthlyCap();

  const hasResume = Boolean(profile?.resume_text?.trim());
  const greetingName = profile?.display_name?.trim() || user.email?.split('@')[0] || user.email;

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'success':
        return <span className="badge badge-emerald">Success</span>;
      case 'partial':
        return <span className="badge badge-amber">Partial Run</span>;
      case 'failed':
        return <span className="badge badge-red">Failed</span>;
      default:
        return <span className="badge badge-gray">No Runs Yet</span>;
    }
  };

  const getReasonLabel = (reason?: string) => {
    switch (reason) {
      case 'done':
        return 'All Pending Scored';
      case 'cap':
        return 'Daily Cap Reached';
      case 'time':
        return 'Time Limit Reached (45s)';
      case 'rate_limit':
        return 'Groq Rate Limit Paused';
      case 'error':
        return 'Encountered Error';
      default:
        return reason || 'N/A';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Resume Reminder Banner if empty */}
      {!hasResume && (
        <div
          style={{
            padding: '1rem 1.25rem',
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 'var(--radius-md, 8px)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>📝</span>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--accent-warning, #fbbf24)' }}>
                Add your resume to enable scoring
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                Your master resume is required by the AI Matcher to evaluate fit score and tailor applications.
              </div>
            </div>
          </div>
          <Link href="/profile" className="btn btn-primary" style={{ fontSize: '0.8125rem' }}>
            Configure Profile →
          </Link>
        </div>
      )}

      {/* Welcome Card */}
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(18, 24, 36, 0.9), rgba(26, 34, 51, 0.9))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <span className="badge badge-emerald">Active</span>
              <span className="badge badge-blue">JSearch monthly usage: {monthlyUsage}/{monthlyCap}</span>
            </div>
            <h1 className="card-title" style={{ fontSize: '1.75rem' }}>
              Welcome back, {greetingName}
            </h1>
            <p className="card-desc" style={{ maxWidth: '650px', marginTop: '0.5rem' }}>
              Your personal Job Search Copilot is active. Target companies, automated job feeds, AI fit scoring, tailored outreach, and application pipeline tracking are ready.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link href="/companies" className="btn btn-secondary">
              Target Companies ({companiesCount || 0})
            </Link>
            <Link href="/jobs" className="btn btn-primary">
              Matching Jobs ({jobsCount || 0})
            </Link>
          </div>
        </div>
      </div>

      {/* Auto-Fetch Cron Status Card */}
      <div className="card" style={{ borderLeft: '4px solid var(--primary, #6366f1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <h3 className="card-title" style={{ fontSize: '1.125rem' }}>
                Automated Job Fetching & Scoring
              </h3>
              {getStatusBadge(lastCronRun?.status)}
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Scheduled via GitHub Actions every 6 hours. Automatically pulls new ATS postings and scores them with Groq.
            </p>
          </div>
          {lastCronRun && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Last execution</div>
              <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                <LocalTime isoDate={lastCronRun.started_at} format="datetime" />
              </div>
            </div>
          )}
        </div>

        {lastCronRun ? (
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '0.75rem',
                padding: '0.875rem',
                backgroundColor: 'var(--bg-card-secondary, rgba(255, 255, 255, 0.03))',
                borderRadius: '8px',
                border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Raw Fetched</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{lastCronRun.fetched}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Filter Passed</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--accent-info, #38bdf8)' }}>
                  {lastCronRun.matched}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>New Inserted</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--accent-success, #34d399)' }}>
                  {lastCronRun.inserted}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Pre-filtered</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {lastCronRun.prefiltered || 0}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Auto-Scored</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--accent-warning, #fbbf24)' }}>
                  {lastCronRun.scored}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Stop Reason</div>
                <div style={{ fontSize: '0.875rem', fontWeight: 500, marginTop: '0.25rem' }}>
                  {getReasonLabel(lastCronRun.stopped_reason)}
                </div>
              </div>
            </div>

            {Array.isArray(lastCronRun.errors) && lastCronRun.errors.length > 0 && (
              <div
                style={{
                  marginTop: '0.75rem',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  fontSize: '0.8125rem',
                  color: '#f87171',
                }}
              >
                <strong>Run Notices:</strong>
                <ul style={{ margin: '0.25rem 0 0 1.25rem', padding: 0 }}>
                  {lastCronRun.errors.map((errStr: string, idx: number) => (
                    <li key={idx}>{errStr}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              padding: '1rem',
              backgroundColor: 'var(--bg-card-secondary, rgba(255, 255, 255, 0.02))',
              borderRadius: '8px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: '0.875rem',
            }}
          >
            No automated runs logged yet. Once GitHub Actions runs or you trigger a manual run, execution metrics will appear here.
          </div>
        )}
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
            Manage Resume & Filters
          </Link>
        </div>

        {/* ATS Ingestion Card */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <h3 className="card-title" style={{ fontSize: '1.125rem' }}>Job Feeds & Filter</h3>
            <span className="badge badge-emerald">Active</span>
          </div>
          <p style={{ fontSize: '0.875rem', marginBottom: '1.25rem', color: 'var(--text-secondary)' }}>
            {companiesCount || 0} target companies configured • {jobsCount || 0} active matching jobs.
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
            <span className="badge badge-emerald">Active</span>
          </div>
          <p style={{ fontSize: '0.875rem', marginBottom: '1.25rem', color: 'var(--text-secondary)' }}>
            Sequential Groq scoring with seniority matcher, anti-fabrication bullet verification, and outreach drafting.
          </p>
          <Link href="/jobs" className="btn btn-primary" style={{ width: '100%', textAlign: 'center' }}>
            ⚡ Score & Review Jobs ({jobsCount || 0})
          </Link>
        </div>

        {/* Pipeline Tracker Card */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <h3 className="card-title" style={{ fontSize: '1.125rem' }}>Pipeline Tracker</h3>
            <span className="badge badge-emerald">Active</span>
          </div>
          <p style={{ fontSize: '0.875rem', marginBottom: '1.25rem', color: 'var(--text-secondary)' }}>
            {applicationsCount || 0} active applications tracked across pipeline stages with IST follow-up nudges.
          </p>
          <Link href="/tracker" className="btn btn-secondary" style={{ width: '100%', textAlign: 'center' }}>
            Open Tracker ({applicationsCount || 0})
          </Link>
        </div>
      </div>
    </div>
  );
}
