'use client';

import { useState } from 'react';
import { deleteJobAction } from '@/app/jobs/actions';
import { LocalTime } from '@/components/LocalTime';
import { EligibilityBadge } from '@/components/EligibilityBadge';
import { ScoreStatusBadge } from '@/components/ScoreStatusBadge';
import Link from 'next/link';

export interface JobRecord {
  id: string;
  user_id: string;
  company_id: string | null;
  title: string;
  company_name: string;
  location: string;
  job_url: string;
  description: string;
  source: 'feed' | 'manual';
  needs_eligibility_check: boolean;
  score_status: 'pending' | 'scored' | 'scoring failed';
  fit_score: number | null;
  match_analysis: any;
  seniority_match: string | null;
  scored_at: string | null;
  created_at: string;
  updated_at: string;
}

interface JobsListProps {
  initialJobs: JobRecord[];
}

export function JobsList({ initialJobs }: JobsListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);

  const filteredJobs = initialJobs.filter((job) => {
    const q = searchTerm.toLowerCase();
    return (
      job.title.toLowerCase().includes(q) ||
      job.company_name.toLowerCase().includes(q) ||
      job.location.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Header & Quick Actions */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <h1 className="card-title">Ingested Jobs</h1>
            <span className="badge badge-emerald">{initialJobs.length} Total</span>
          </div>
          <p className="card-desc">
            Product roles filtered for India or eligible Remote. All newly fetched or pasted jobs start with <code>score_status = 'pending'</code>.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/companies" className="btn btn-secondary" style={{ fontSize: '0.8125rem' }}>
            ⚙ Manage Feeds
          </Link>
          <Link href="/jobs/paste" className="btn btn-primary" style={{ fontSize: '0.8125rem' }}>
            + Paste a Job
          </Link>
        </div>
      </div>

      {/* Search Filter Bar */}
      <div style={{ display: 'flex', gap: '1rem' }}>
        <input
          type="text"
          className="input"
          placeholder="Search jobs by title, company, or city..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ maxWidth: '450px' }}
        />
      </div>

      {/* Jobs Table / Cards */}
      {filteredJobs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '1.125rem', color: 'var(--text-secondary)' }}>No matching jobs found.</p>
          <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
            {initialJobs.length === 0
              ? 'Fetch job boards under Companies or manually paste a job description.'
              : 'Try adjusting your search query.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredJobs.map((job) => (
            <div
              key={job.id}
              className="card"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: '1.25rem',
                padding: '1.25rem 1.5rem',
              }}
            >
              <div style={{ flex: 1, minWidth: '280px' }}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.375rem' }}>
                  <h3 style={{ fontSize: '1.125rem', color: 'var(--text-primary)', margin: 0 }}>
                    {job.title}
                  </h3>
                  <ScoreStatusBadge status={job.score_status} fitScore={job.fit_score} />
                  {job.needs_eligibility_check && <EligibilityBadge />}
                  <span className="badge" style={{ backgroundColor: 'var(--bg-tertiary)', fontSize: '0.6875rem' }}>
                    {job.source === 'feed' ? 'ATS Feed' : 'Manual Paste'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{job.company_name}</strong>
                  <span>•</span>
                  <span>📍 {job.location}</span>
                  <span>•</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Added <LocalTime isoDate={job.created_at} format="date" />
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8125rem' }}>
                  <a
                    href={job.job_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                  >
                    View Original Posting ↗
                  </a>
                  <button
                    onClick={() => setSelectedJob(selectedJob?.id === job.id ? null : job)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', fontSize: 'inherit', padding: 0 }}
                  >
                    {selectedJob?.id === job.id ? 'Hide Description ▲' : 'View Description ▼'}
                  </button>
                </div>

                {/* Collapsible Sanitized Description */}
                {selectedJob?.id === job.id && (
                  <div
                    style={{
                      marginTop: '1rem',
                      padding: '1rem',
                      backgroundColor: 'var(--bg-secondary)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '0.8125rem',
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                      maxHeight: '300px',
                      overflowY: 'auto',
                    }}
                  >
                    {job.description}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <form action={deleteJobAction}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <button
                    type="submit"
                    className="btn btn-danger"
                    style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                    title="Delete Job"
                  >
                    ✕
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
