'use client';

import { useState, useTransition, useRef } from 'react';
import { dismissJobAction, restoreJobAction, recleanJobDescriptionsAction, resetJobScoreAction } from '@/app/jobs/actions';
import { LocalTime } from '@/components/LocalTime';
import { EligibilityBadge } from '@/components/EligibilityBadge';
import { ScoreStatusBadge } from '@/components/ScoreStatusBadge';
import { SeniorityBadge } from '@/components/SeniorityBadge';
import { FeedbackButtons } from '@/components/FeedbackButtons';
import Link from 'next/link';

export interface MatchAnalysis {
  top_reasons?: string[];
  gaps?: string[];
  recommended_resume_bullets_to_lead_with?: string[];
}

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
  dismissed: boolean;
  score_status: 'pending' | 'scored' | 'failed';
  fit_score: number | null;
  match_analysis: MatchAnalysis | null;
  seniority_match: 'under' | 'fit' | 'over' | string | null;
  scored_model: string | null;
  scored_at: string | null;
  created_at: string;
  updated_at: string;
}

interface JobsListProps {
  initialJobs: JobRecord[];
  initialFeedbacks?: Record<string, 'up' | 'down'>;
}

type SortOption = 'score_desc' | 'score_asc' | 'newest' | 'oldest';
type SeniorityFilter = 'all' | 'fit' | 'over' | 'under';
type StatusFilter = 'all' | 'pending' | 'scored' | 'failed';

export function JobsList({ initialJobs, initialFeedbacks = {} }: JobsListProps) {
  const [jobs, setJobs] = useState<JobRecord[]>(initialJobs);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDismissed, setShowDismissed] = useState(false);
  const [seniorityFilter, setSeniorityFilter] = useState<SeniorityFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  // Expanded views
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [viewingDescriptionId, setViewingDescriptionId] = useState<string | null>(null);

  // Maintenance & Actions
  const [isRecleaning, startRecleanTransition] = useTransition();
  const [recleanMessage, setRecleanMessage] = useState<string | null>(null);

  // Queue state
  const [isScoringQueueRunning, setIsScoringQueueRunning] = useState(false);
  const [scoringProgress, setScoringProgress] = useState<{
    current: number;
    total: number;
    currentJobTitle: string;
    statusText: string;
  } | null>(null);
  const [currentlyScoringJobId, setCurrentlyScoringJobId] = useState<string | null>(null);
  const abortQueueRef = useRef<boolean>(false);

  const pendingJobs = jobs.filter((j) => !j.dismissed && (j.score_status === 'pending' || j.score_status === 'failed'));
  const totalDismissed = jobs.filter((j) => j.dismissed).length;
  const activeJobsCount = jobs.length - totalDismissed;

  const handleReclean = () => {
    startRecleanTransition(async () => {
      setRecleanMessage(null);
      const res = await recleanJobDescriptionsAction();
      setRecleanMessage(res.message);
      setTimeout(() => setRecleanMessage(null), 5000);
    });
  };

  /**
   * Score a single job via /api/score/job
   */
  const scoreSingleJob = async (jobId: string): Promise<boolean> => {
    setCurrentlyScoringJobId(jobId);
    try {
      const response = await fetch('/api/score/job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });

      const resData = await response.json();

      if (response.ok && resData.success) {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  fit_score: resData.fit_score,
                  match_analysis: resData.match_analysis,
                  seniority_match: resData.seniority_match,
                  scored_model: resData.scored_model,
                  score_status: 'scored',
                  scored_at: new Date().toISOString(),
                }
              : j
          )
        );
        return true;
      } else if (response.status === 429) {
        // Return 429 retry requirement
        const waitSec = resData.retryAfterSeconds || 5;
        throw { is429: true, retryAfterSeconds: waitSec, message: resData.message };
      } else {
        setJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, score_status: 'failed' } : j))
        );
        return false;
      }
    } catch (err: any) {
      if (err?.is429) throw err;
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, score_status: 'failed' } : j))
      );
      return false;
    } finally {
      setCurrentlyScoringJobId(null);
    }
  };

  /**
   * Re-score action: resets status to pending and immediately re-scores
   */
  const handleRescore = async (jobId: string) => {
    await resetJobScoreAction(jobId);
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? {
              ...j,
              score_status: 'pending',
              fit_score: null,
              match_analysis: null,
              seniority_match: null,
              scored_model: null,
              scored_at: null,
            }
          : j
      )
    );
    await scoreSingleJob(jobId);
  };

  /**
   * Score all pending jobs in a client-paced sequential queue
   */
  const handleScoreAllPending = async () => {
    const queue = jobs.filter(
      (j) => !j.dismissed && (j.score_status === 'pending' || j.score_status === 'failed')
    );
    if (queue.length === 0) return;

    setIsScoringQueueRunning(true);
    abortQueueRef.current = false;

    let index = 0;
    for (const job of queue) {
      if (abortQueueRef.current) break;

      setScoringProgress({
        current: index + 1,
        total: queue.length,
        currentJobTitle: `${job.company_name}: ${job.title}`,
        statusText: 'Scoring job with AI...',
      });

      let success = false;
      let attempts = 0;
      while (!success && attempts < 3 && !abortQueueRef.current) {
        attempts++;
        try {
          await scoreSingleJob(job.id);
          success = true;
        } catch (err: any) {
          if (err?.is429) {
            const waitSec = err.retryAfterSeconds || 6;
            for (let s = waitSec; s > 0; s--) {
              if (abortQueueRef.current) break;
              setScoringProgress({
                current: index + 1,
                total: queue.length,
                currentJobTitle: `${job.company_name}: ${job.title}`,
                statusText: `Rate limit reached. Pacing queue for ${s}s...`,
              });
              await new Promise((r) => setTimeout(r, 1000));
            }
          } else {
            break; // Non-429 error, move to next
          }
        }
      }

      index++;
      // Brief pause to prevent burst limits
      await new Promise((r) => setTimeout(r, 300));
    }

    setIsScoringQueueRunning(false);
    setScoringProgress(null);
  };

  const handleStopQueue = () => {
    abortQueueRef.current = true;
    setIsScoringQueueRunning(false);
    setScoringProgress(null);
  };

  // Filter & Sort Pipeline
  const processedJobs = jobs
    .filter((job) => {
      // Dismissed toggle
      if (!showDismissed && job.dismissed) return false;

      // Status filter
      if (statusFilter !== 'all' && job.score_status !== statusFilter) return false;

      // Seniority filter
      if (seniorityFilter !== 'all') {
        const jobSen = (job.seniority_match || '').toLowerCase();
        if (jobSen !== seniorityFilter) return false;
      }

      // Search query
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matches =
          job.title.toLowerCase().includes(q) ||
          job.company_name.toLowerCase().includes(q) ||
          job.location.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'score_desc') {
        const scoreA = a.fit_score ?? -1;
        const scoreB = b.fit_score ?? -1;
        return scoreB - scoreA;
      }
      if (sortBy === 'score_asc') {
        const scoreA = a.fit_score ?? 999;
        const scoreB = b.fit_score ?? 999;
        return scoreA - scoreB;
      }
      if (sortBy === 'oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      // default: newest
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Header & Summary Card */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
            <h1 className="card-title" style={{ margin: 0 }}>Ingested Jobs</h1>
            <span className="badge badge-emerald">{activeJobsCount} Active</span>
            {pendingJobs.length > 0 && (
              <span className="badge badge-amber">
                ⚡ {pendingJobs.length} Unscored
              </span>
            )}
            {totalDismissed > 0 && (
              <span className="badge" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                {totalDismissed} Dismissed
              </span>
            )}
          </div>
          <p className="card-desc" style={{ margin: 0 }}>
            AI-driven fit scoring, seniority verification, and tailored resume bullet recommendations.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {pendingJobs.length > 0 && (
            <button
              onClick={isScoringQueueRunning ? handleStopQueue : handleScoreAllPending}
              className={`btn ${isScoringQueueRunning ? 'btn-danger' : 'btn-primary'}`}
              style={{ fontSize: '0.8125rem', padding: '0.5rem 0.85rem', fontWeight: 600 }}
            >
              {isScoringQueueRunning ? '⏹ Stop Scoring' : `⚡ Score All Pending (${pendingJobs.length})`}
            </button>
          )}

          <button
            onClick={handleReclean}
            className="btn btn-secondary"
            style={{ fontSize: '0.8125rem', padding: '0.5rem 0.75rem' }}
            disabled={isRecleaning || jobs.length === 0}
            title="Re-run HTML sanitizer across all stored job descriptions"
          >
            {isRecleaning ? 'Re-cleaning...' : '🧹 Re-clean'}
          </button>
          <Link href="/companies" className="btn btn-secondary" style={{ fontSize: '0.8125rem' }}>
            ⚙ Feeds
          </Link>
          <Link href="/jobs/paste" className="btn btn-secondary" style={{ fontSize: '0.8125rem' }}>
            + Paste Job
          </Link>
        </div>
      </div>

      {/* Scoring Queue Live Progress Banner */}
      {scoringProgress && (
        <div
          className="card"
          style={{
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            padding: '1rem 1.25rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--accent-blue)' }}>
              ⚡ Scoring Queue Progress: {scoringProgress.current} / {scoringProgress.total}
            </span>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              {scoringProgress.statusText}
            </span>
          </div>

          <div
            style={{
              width: '100%',
              height: '6px',
              backgroundColor: 'rgba(255,255,255,0.1)',
              borderRadius: '999px',
              overflow: 'hidden',
              marginBottom: '0.5rem',
            }}
          >
            <div
              style={{
                width: `${(scoringProgress.current / scoringProgress.total) * 100}%`,
                height: '100%',
                backgroundColor: 'var(--accent-blue)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>

          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Currently evaluating: <strong>{scoringProgress.currentJobTitle}</strong>
          </div>
        </div>
      )}

      {recleanMessage && (
        <div className="alert alert-success" style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>
          <span>{recleanMessage}</span>
        </div>
      )}

      {/* Filter and Sorting Control Bar */}
      <div
        className="card"
        style={{
          padding: '1rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', flex: 1, minWidth: '300px' }}>
          {/* Search Box */}
          <input
            type="text"
            className="input"
            placeholder="Search by title, company, location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ flex: 1, minWidth: '220px', maxWidth: '360px', padding: '0.45rem 0.75rem', fontSize: '0.875rem' }}
          />

          {/* Seniority Filter */}
          <select
            className="input"
            value={seniorityFilter}
            onChange={(e) => setSeniorityFilter(e.target.value as SeniorityFilter)}
            style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.875rem', cursor: 'pointer' }}
          >
            <option value="all">Seniority: All</option>
            <option value="fit">🎯 Fit Only</option>
            <option value="over">⚠️ Over Only</option>
            <option value="under">🔻 Under Only</option>
          </select>

          {/* Status Filter */}
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.875rem', cursor: 'pointer' }}
          >
            <option value="all">Status: All</option>
            <option value="scored">Scored</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>

          {/* Sort By */}
          <select
            className="input"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.875rem', cursor: 'pointer' }}
          >
            <option value="newest">Sort: Newest Added</option>
            <option value="score_desc">Sort: Highest Fit Score</option>
            <option value="score_asc">Sort: Lowest Fit Score</option>
            <option value="oldest">Sort: Oldest Added</option>
          </select>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-secondary)', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={showDismissed}
            onChange={(e) => setShowDismissed(e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: 'var(--accent-blue)', cursor: 'pointer' }}
          />
          <span>Show dismissed ({totalDismissed})</span>
        </label>
      </div>

      {/* Jobs Feed List */}
      {processedJobs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '1.125rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem' }}>
            No matching jobs found.
          </p>
          <p style={{ fontSize: '0.875rem', margin: 0 }}>
            {jobs.length === 0
              ? 'Fetch job boards under Companies or manually paste a job description.'
              : totalDismissed > 0 && !showDismissed
              ? 'All matching jobs may be dismissed. Enable "Show dismissed" above.'
              : 'Try adjusting your filters or search query.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {processedJobs.map((job) => {
            const isExpanded = expandedJobId === job.id;
            const isDescVisible = viewingDescriptionId === job.id;
            const isScoringThis = currentlyScoringJobId === job.id;
            const userRating = initialFeedbacks[job.id] || null;

            return (
              <div
                key={job.id}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  padding: '1.25rem 1.5rem',
                  opacity: job.dismissed ? 0.6 : 1,
                  borderStyle: job.dismissed ? 'dashed' : 'solid',
                  transition: 'border-color 0.15s ease',
                }}
              >
                {/* Main Card Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ flex: 1, minWidth: '280px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.375rem' }}>
                      <h3 style={{ fontSize: '1.125rem', color: 'var(--text-primary)', margin: 0 }}>
                        {job.title}
                      </h3>
                      <ScoreStatusBadge status={job.score_status} fitScore={job.fit_score} />
                      <SeniorityBadge seniority={job.seniority_match} />
                      {job.needs_eligibility_check && <EligibilityBadge />}
                      {job.dismissed && (
                        <span className="badge badge-rose" style={{ fontSize: '0.6875rem' }}>
                          Dismissed
                        </span>
                      )}
                      {job.scored_model && (
                        <span
                          className="badge"
                          style={{
                            backgroundColor: 'rgba(255,255,255,0.06)',
                            fontSize: '0.65rem',
                            color: 'var(--text-muted)',
                          }}
                          title={`Evaluated with Groq model: ${job.scored_model}`}
                        >
                          {job.scored_model.includes('70b') ? '70B' : '8B'}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem', fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{job.company_name}</strong>
                      <span>•</span>
                      <span>📍 {job.location}</span>
                      <span>•</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Added <LocalTime isoDate={job.created_at} format="date" />
                      </span>
                    </div>

                    {/* Action Links & Quick Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', fontSize: '0.8125rem' }}>
                      <a
                        href={job.job_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                      >
                        Original Posting ↗
                      </a>

                      <button
                        type="button"
                        onClick={() => setViewingDescriptionId(isDescVisible ? null : job.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', fontSize: 'inherit', padding: 0 }}
                      >
                        {isDescVisible ? 'Hide Description ▲' : 'View Description ▼'}
                      </button>

                      {job.score_status === 'scored' && job.match_analysis && (
                        <button
                          type="button"
                          onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent-blue)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: 'inherit',
                            padding: 0,
                          }}
                        >
                          {isExpanded ? 'Hide Match Analysis ▲' : '🎯 View Match Analysis ▼'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Card Right Action Buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {/* Score / Retry / Rescore Button */}
                    {!job.dismissed && (
                      <>
                        {job.score_status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => scoreSingleJob(job.id)}
                            disabled={isScoringThis || isScoringQueueRunning}
                            className="btn btn-primary"
                            style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                          >
                            {isScoringThis ? 'Scoring...' : '⚡ Score'}
                          </button>
                        )}
                        {job.score_status === 'failed' && (
                          <button
                            type="button"
                            onClick={() => scoreSingleJob(job.id)}
                            disabled={isScoringThis || isScoringQueueRunning}
                            className="btn btn-secondary"
                            style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem', borderColor: '#f87171', color: '#f87171' }}
                          >
                            {isScoringThis ? 'Retrying...' : '🔄 Retry'}
                          </button>
                        )}
                        {job.score_status === 'scored' && (
                          <button
                            type="button"
                            onClick={() => handleRescore(job.id)}
                            disabled={isScoringThis || isScoringQueueRunning}
                            className="btn btn-secondary"
                            style={{ padding: '0.375rem 0.65rem', fontSize: '0.75rem' }}
                            title="Re-run score with current profile resume"
                          >
                            {isScoringThis ? 'Scoring...' : '🔄 Re-score'}
                          </button>
                        )}
                      </>
                    )}

                    {/* Dismiss / Restore */}
                    {job.dismissed ? (
                      <form action={restoreJobAction}>
                        <input type="hidden" name="job_id" value={job.id} />
                        <button
                          type="submit"
                          className="btn btn-secondary"
                          style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                          title="Restore Job to Active List"
                        >
                          Restore
                        </button>
                      </form>
                    ) : (
                      <form action={dismissJobAction}>
                        <input type="hidden" name="job_id" value={job.id} />
                        <button
                          type="submit"
                          className="btn btn-danger"
                          style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                          title="Dismiss Job"
                        >
                          ✕
                        </button>
                      </form>
                    )}
                  </div>
                </div>

                {/* Collapsible Sanitized Description */}
                {isDescVisible && (
                  <div
                    style={{
                      marginTop: '0.5rem',
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

                {/* Expanded Match Analysis Breakdown Drawer */}
                {isExpanded && job.match_analysis && (
                  <div
                    style={{
                      marginTop: '0.75rem',
                      padding: '1.25rem',
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
                          Match Analysis Breakdown
                        </span>
                        <span className="badge badge-emerald" style={{ fontSize: '0.75rem' }}>
                          Fit Score: {job.fit_score}/100
                        </span>
                        <SeniorityBadge seniority={job.seniority_match} />
                      </div>

                      {/* Feedback Buttons */}
                      <FeedbackButtons jobId={job.id} initialRating={userRating} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                      {/* Top Match Reasons */}
                      <div>
                        <h4 style={{ fontSize: '0.8125rem', color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem' }}>
                          ✅ Top Strengths & Match Reasons
                        </h4>
                        {job.match_analysis.top_reasons && job.match_analysis.top_reasons.length > 0 ? (
                          <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            {job.match_analysis.top_reasons.map((reason, idx) => (
                              <li key={idx} style={{ marginBottom: '0.35rem' }}>
                                {reason}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>No explicit match strengths specified.</p>
                        )}
                      </div>

                      {/* Gaps / Missing Requirements */}
                      <div>
                        <h4 style={{ fontSize: '0.8125rem', color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem' }}>
                          ⚠️ Identified Gaps / Requirements
                        </h4>
                        {job.match_analysis.gaps && job.match_analysis.gaps.length > 0 ? (
                          <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            {job.match_analysis.gaps.map((gap, idx) => (
                              <li key={idx} style={{ marginBottom: '0.35rem' }}>
                                {gap}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p style={{ fontSize: '0.8125rem', color: '#34d399', margin: 0 }}>No critical skill or domain gaps detected!</p>
                        )}
                      </div>
                    </div>

                    {/* Recommended Resume Bullets (Verbatim Checked) */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <h4 style={{ fontSize: '0.8125rem', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                          📋 Recommended Resume Bullets to Lead With
                        </h4>
                        <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                          (Verified from your resume)
                        </span>
                      </div>
                      {job.match_analysis.recommended_resume_bullets_to_lead_with &&
                      job.match_analysis.recommended_resume_bullets_to_lead_with.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {job.match_analysis.recommended_resume_bullets_to_lead_with.map((bullet, idx) => (
                            <div
                              key={idx}
                              style={{
                                padding: '0.625rem 0.85rem',
                                backgroundColor: 'var(--bg-secondary)',
                                borderLeft: '3px solid var(--accent-cyan)',
                                borderRadius: '0 var(--radius-md) var(--radius-md) 0',
                                fontSize: '0.8125rem',
                                color: 'var(--text-primary)',
                                lineHeight: 1.5,
                              }}
                            >
                              {bullet}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>
                          No exact matching bullets extracted from your current resume.
                        </p>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem' }}>
                      <span>Model: <code>{job.scored_model || 'llama-3.3-70b-versatile'}</code></span>
                      {job.scored_at && (
                        <span>
                          Scored <LocalTime isoDate={job.scored_at} format="datetime" />
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
