'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { dismissJobAction, restoreJobAction, recleanJobDescriptionsAction, resetJobScoreAction, scanAtsKeywordsAction } from '@/app/jobs/actions';
import { trackJobAction } from '@/app/tracker/actions';
import { LocalTime } from '@/components/LocalTime';
import { EligibilityBadge } from '@/components/EligibilityBadge';
import { ScoreStatusBadge } from '@/components/ScoreStatusBadge';
import { SeniorityBadge } from '@/components/SeniorityBadge';
import { FeedbackButtons } from '@/components/FeedbackButtons';
import { OutreachModal } from '@/components/OutreachModal';
import { AtsScanSection } from '@/components/AtsScanSection';
import { AtsScanResult } from '@/lib/ats-scanner/types';
import { formatShortModelName } from '@/lib/groq/config';
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
  source: 'feed' | 'manual' | 'search';
  apply_options?: Array<{ publisher: string; apply_link: string; is_direct?: boolean }>;
  external_id?: string | null;
  needs_eligibility_check: boolean;
  dismissed: boolean;
  score_status: 'pending' | 'scored' | 'failed';
  score_error?: string | null;
  fit_score: number | null;
  match_analysis: MatchAnalysis | null;
  seniority_match: 'under' | 'fit' | 'over' | string | null;
  scored_model: string | null;
  scored_at: string | null;
  ats_scan?: AtsScanResult | null;
  ats_coverage?: number | null;
  ats_scanned_at?: string | null;
  ats_model?: string | null;
  ats_resume_fingerprint?: string | null;
  cover_note?: string | null;
  referral_message?: string | null;
  last_generated_cover_note?: string | null;
  last_generated_referral?: string | null;
  outreach_model?: string | null;
  outreach_updated_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface JobsListProps {
  initialJobs: JobRecord[];
  initialFeedbacks?: Record<string, 'up' | 'down'>;
  initialApplicationsMap?: Record<string, { id: string; stage: string }>;
}

type SortOption = 'score_desc' | 'score_asc' | 'newest' | 'oldest';
type SeniorityFilter = 'all' | 'fit' | 'over' | 'under';
type StatusFilter = 'all' | 'pending' | 'scored' | 'failed';

export function JobsList({
  initialJobs,
  initialFeedbacks = {},
  initialApplicationsMap = {},
}: JobsListProps) {
  const [jobs, setJobs] = useState<JobRecord[]>(initialJobs);
  const [applicationsMap, setApplicationsMap] = useState<
    Record<string, { id: string; stage: string }>
  >(initialApplicationsMap);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDismissed, setShowDismissed] = useState(false);
  const [seniorityFilter, setSeniorityFilter] = useState<SeniorityFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  // Expanded views
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [viewingDescriptionId, setViewingDescriptionId] = useState<string | null>(null);
  const [viewingAtsJobId, setViewingAtsJobId] = useState<string | null>(null);
  const [atsScanningJobId, setAtsScanningJobId] = useState<string | null>(null);
  const [atsScanStaleMap, setAtsScanStaleMap] = useState<Record<string, boolean>>({});

  // Maintenance & Action Feedback
  const [isRecleaning, startRecleanTransition] = useTransition();
  const [recleanMessage, setRecleanMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    text: string;
    isError?: boolean;
    isWarning?: boolean;
  } | null>(null);

  const handleRunAtsScan = async (jobId: string, forceRescan: boolean = false) => {
    setAtsScanningJobId(jobId);
    setViewingAtsJobId(jobId);

    try {
      const res = await scanAtsKeywordsAction(jobId, { forceRescan });
      if (res.success && res.ats_scan) {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  ats_scan: res.ats_scan,
                  ats_coverage: res.ats_coverage ?? res.ats_scan?.coverage.overall_percentage ?? null,
                  ats_scanned_at: res.ats_scanned_at ?? new Date().toISOString(),
                  ats_model: res.ats_model ?? null,
                  ats_resume_fingerprint: res.ats_resume_fingerprint ?? null,
                }
              : j
          )
        );
        if (res.isStale) {
          setAtsScanStaleMap((prev) => ({ ...prev, [jobId]: true }));
        } else {
          setAtsScanStaleMap((prev) => ({ ...prev, [jobId]: false }));
        }
        setActionMessage({
          text: res.cached ? 'Loaded cached ATS scan.' : 'ATS scan completed successfully!',
          isError: false,
        });
        setTimeout(() => setActionMessage(null), 4000);
      } else {
        setActionMessage({
          text: res.error || 'Failed to complete ATS scan.',
          isError: true,
        });
        setTimeout(() => setActionMessage(null), 6000);
      }
    } catch (err: any) {
      setActionMessage({
        text: err?.message || 'Unexpected error running ATS scan.',
        isError: true,
      });
      setTimeout(() => setActionMessage(null), 6000);
    } finally {
      setAtsScanningJobId(null);
    }
  };

  // Sync state when initialJobs change from server revalidation
  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  // Outreach Modal state (Phase 4)
  const [outreachJob, setOutreachJob] = useState<JobRecord | null>(null);
  const [isOutreachModalOpen, setIsOutreachModalOpen] = useState(false);

  const handleOutreachUpdated = (
    jobId: string,
    coverNote: string,
    referralMessage: string,
    lastGeneratedCoverNote: string,
    lastGeneratedReferral: string,
    outreachModel: string,
    outreachUpdatedAt: string
  ) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? {
              ...j,
              cover_note: coverNote,
              referral_message: referralMessage,
              last_generated_cover_note: lastGeneratedCoverNote,
              last_generated_referral: lastGeneratedReferral,
              outreach_model: outreachModel,
              outreach_updated_at: outreachUpdatedAt,
            }
          : j
      )
    );
    if (outreachJob && outreachJob.id === jobId) {
      setOutreachJob((prev) =>
        prev
          ? {
              ...prev,
              cover_note: coverNote,
              referral_message: referralMessage,
              last_generated_cover_note: lastGeneratedCoverNote,
              last_generated_referral: lastGeneratedReferral,
              outreach_model: outreachModel,
              outreach_updated_at: outreachUpdatedAt,
            }
          : null
      );
    }
  };

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

  const unscoredJobs = jobs.filter((j) => !j.dismissed && j.score_status === 'pending');
  const failedJobs = jobs.filter((j) => !j.dismissed && j.score_status === 'failed');
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
   * Restore a dismissed job with immediate optimistic UI and feedback message
   */
  const handleRestore = async (jobId: string) => {
    // Optimistic update
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, dismissed: false } : j))
    );

    try {
      const res = await restoreJobAction(jobId);
      if (res.success) {
        if (res.filterWarning) {
          setActionMessage({
            text: `${res.message || 'Job restored.'} ${res.filterWarning}`,
            isWarning: true,
          });
        } else {
          setActionMessage({
            text: res.message || 'Job restored successfully!',
            isError: false,
          });
        }
        setTimeout(() => setActionMessage(null), 6000);
      } else {
        // Revert optimistic update
        setJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, dismissed: true } : j))
        );
        setActionMessage({ text: res.error || 'Failed to restore job', isError: true });
        setTimeout(() => setActionMessage(null), 6000);
      }
    } catch (err: any) {
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, dismissed: true } : j))
      );
      setActionMessage({ text: err?.message || 'Unexpected restore error', isError: true });
      setTimeout(() => setActionMessage(null), 6000);
    }
  };

  /**
   * Dismiss a job with immediate optimistic UI and feedback message
   */
  const handleDismiss = async (jobId: string) => {
    // Optimistic update
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, dismissed: true } : j))
    );

    try {
      const res = await dismissJobAction(jobId);
      if (res.success) {
        setActionMessage({ text: res.message || 'Job dismissed.', isError: false });
        setTimeout(() => setActionMessage(null), 4000);
      } else {
        // Revert optimistic update
        setJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, dismissed: false } : j))
        );
        setActionMessage({ text: res.error || 'Failed to dismiss job', isError: true });
        setTimeout(() => setActionMessage(null), 6000);
      }
    } catch (err: any) {
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, dismissed: false } : j))
      );
      setActionMessage({ text: err?.message || 'Unexpected dismiss error', isError: true });
      setTimeout(() => setActionMessage(null), 6000);
    }
  };

  /**
   * Track job in application tracker (Phase 5)
   */
  const handleTrackJob = async (jobId: string) => {
    // Optimistic badge update
    setApplicationsMap((prev) => ({
      ...prev,
      [jobId]: { id: 'temp', stage: 'saved' },
    }));

    try {
      const res = await trackJobAction(jobId, 'saved');
      if (res.success && res.application) {
        setApplicationsMap((prev) => ({
          ...prev,
          [jobId]: { id: res.application.id, stage: res.application.stage },
        }));
        setActionMessage({ text: res.message || 'Added to Tracker!', isError: false });
        setTimeout(() => setActionMessage(null), 4000);
      } else {
        setApplicationsMap((prev) => {
          const copy = { ...prev };
          delete copy[jobId];
          return copy;
        });
        setActionMessage({ text: res.error || 'Failed to track job', isError: true });
        setTimeout(() => setActionMessage(null), 5000);
      }
    } catch (err: any) {
      setApplicationsMap((prev) => {
        const copy = { ...prev };
        delete copy[jobId];
        return copy;
      });
      setActionMessage({ text: err?.message || 'Unexpected tracking error', isError: true });
      setTimeout(() => setActionMessage(null), 5000);
    }
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
                  score_error: null,
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
        const errMsg = resData?.message || 'Scoring failed';
        setJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, score_status: 'failed', score_error: errMsg } : j))
        );
        return false;
      }
    } catch (err: any) {
      if (err?.is429) throw err;
      const errMsg = err?.message || 'Scoring network or server error';
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, score_status: 'failed', score_error: errMsg } : j))
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
              score_error: null,
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
            {unscoredJobs.length > 0 && (
              <span className="badge badge-amber">
                ⚡ {unscoredJobs.length} Unscored
              </span>
            )}
            {failedJobs.length > 0 && (
              <span className="badge badge-rose">
                ⚠️ {failedJobs.length} Failed
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
          {unscoredJobs.length > 0 && (
            <button
              onClick={isScoringQueueRunning ? handleStopQueue : handleScoreAllPending}
              className={`btn ${isScoringQueueRunning ? 'btn-danger' : 'btn-primary'}`}
              style={{ fontSize: '0.8125rem', padding: '0.5rem 0.85rem', fontWeight: 600 }}
            >
              {isScoringQueueRunning ? '⏹ Stop Scoring' : `⚡ Score All Pending (${unscoredJobs.length})`}
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

      {/* User Action Feedback Banner (e.g. Filter Warning or Error on Restore) */}
      {actionMessage && (
        <div
          className={`alert ${
            actionMessage.isError
              ? 'alert-error'
              : actionMessage.isWarning
              ? 'alert-warning'
              : 'alert-success'
          }`}
          style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}
        >
          <span>{actionMessage.text}</span>
        </div>
      )}

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
                      <ScoreStatusBadge status={job.score_status} fitScore={job.fit_score} scoreError={job.score_error} />
                      <SeniorityBadge seniority={job.seniority_match} />
                      {applicationsMap[job.id] && (
                        <Link
                          href="/tracker"
                          className="badge"
                          style={{
                            backgroundColor: 'rgba(99, 102, 241, 0.15)',
                            color: '#818cf8',
                            border: '1px solid rgba(99, 102, 241, 0.3)',
                            textDecoration: 'none',
                            cursor: 'pointer',
                            fontSize: '0.6875rem',
                            fontWeight: 600,
                          }}
                          title="View in Application Tracker"
                        >
                          📌 {applicationsMap[job.id].stage.replace('_', ' ')}
                        </Link>
                      )}
                      {job.needs_eligibility_check && <EligibilityBadge />}
                      {job.source === 'search' && (
                        <span className="badge badge-blue" style={{ fontSize: '0.6875rem' }}>
                          Search
                        </span>
                      )}
                      {job.source === 'feed' && (
                        <span className="badge badge-emerald" style={{ fontSize: '0.6875rem' }}>
                          Board
                        </span>
                      )}
                      {job.source === 'manual' && (
                        <span className="badge badge-amber" style={{ fontSize: '0.6875rem' }}>
                          Manual
                        </span>
                      )}
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
                          {formatShortModelName(job.scored_model)}
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

                    {/* Action Links & Apply Options */}
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.8125rem' }}>
                      {/* Main / Direct Apply Link */}
                      {(() => {
                        const directOpt = Array.isArray(job.apply_options)
                          ? job.apply_options.find((o) => o.is_direct)
                          : undefined;
                        const mainApplyUrl = directOpt?.apply_link || job.job_url;
                        return (
                          <a
                            href={mainApplyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              fontWeight: 600,
                              color: 'var(--primary, #6366f1)',
                            }}
                          >
                            {directOpt ? 'Apply Direct ↗' : 'Apply ↗'}
                          </a>
                        );
                      })()}

                      {/* Additional Publisher Links */}
                      {Array.isArray(job.apply_options) &&
                        job.apply_options.length > 0 &&
                        job.apply_options
                          .filter((opt) => !opt.is_direct)
                          .map((opt, optIdx) => (
                            <a
                              key={optIdx}
                              href={opt.apply_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontSize: '0.75rem',
                                padding: '0.15rem 0.5rem',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                color: 'var(--text-secondary)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                              }}
                            >
                              {opt.publisher} ↗
                            </a>
                          ))}

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

                      {job.score_status === 'scored' && (
                        <button
                          type="button"
                          onClick={() => {
                            if (job.ats_scan) {
                              setViewingAtsJobId(viewingAtsJobId === job.id ? null : job.id);
                            } else {
                              handleRunAtsScan(job.id);
                            }
                          }}
                          disabled={atsScanningJobId === job.id}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent-cyan)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: 'inherit',
                            padding: 0,
                          }}
                        >
                          {atsScanningJobId === job.id
                            ? 'Scanning ATS...'
                            : viewingAtsJobId === job.id
                            ? 'Hide ATS Scan ▲'
                            : job.ats_scan
                            ? `🔍 ATS Scan (${job.ats_coverage ?? job.ats_scan.coverage.overall_percentage}%) ▼`
                            : '🔍 ATS Scan ▼'}
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
                        {job.score_status === 'scored' && job.seniority_match === 'fit' && (
                          <button
                            type="button"
                            onClick={() => {
                              setOutreachJob(job);
                              setIsOutreachModalOpen(true);
                            }}
                            className="btn btn-secondary"
                            style={{
                              padding: '0.375rem 0.65rem',
                              fontSize: '0.75rem',
                              borderColor: job.cover_note ? 'rgba(99, 102, 241, 0.4)' : undefined,
                              color: job.cover_note ? '#818cf8' : undefined,
                            }}
                            title="Draft tailored cover note and LinkedIn referral message"
                          >
                            {job.cover_note ? '✍️ View Outreach' : '✍️ Draft Outreach'}
                          </button>
                        )}
                        {job.score_status === 'scored' && job.seniority_match !== 'fit' && (
                          <button
                            type="button"
                            onClick={() => {
                              setOutreachJob(job);
                              setIsOutreachModalOpen(true);
                            }}
                            className="btn-link"
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: '0.375rem 0.5rem',
                              fontSize: '0.75rem',
                              color: job.cover_note ? '#818cf8' : 'var(--text-muted)',
                              textDecoration: 'underline',
                              cursor: 'pointer',
                            }}
                            title="Draft outreach anyway for non-fit role"
                          >
                            {job.cover_note ? 'View draft' : 'Draft anyway'}
                          </button>
                        )}

                        {job.score_status === 'scored' && !job.ats_scan && (
                          <button
                            type="button"
                            onClick={() => handleRunAtsScan(job.id)}
                            disabled={atsScanningJobId === job.id}
                            className="btn btn-secondary"
                            style={{
                              padding: '0.375rem 0.65rem',
                              fontSize: '0.75rem',
                              borderColor: 'rgba(6, 182, 212, 0.4)',
                              color: 'var(--accent-cyan)',
                            }}
                            title="Run ATS keyword scan against your resume"
                          >
                            {atsScanningJobId === job.id ? 'Scanning...' : '🔍 ATS Scan'}
                          </button>
                        )}
                        {job.score_status === 'scored' && job.ats_scan && (
                          <button
                            type="button"
                            onClick={() => setViewingAtsJobId(viewingAtsJobId === job.id ? null : job.id)}
                            className="btn btn-secondary"
                            style={{
                              padding: '0.375rem 0.65rem',
                              fontSize: '0.75rem',
                              borderColor: 'rgba(6, 182, 212, 0.4)',
                              color: 'var(--accent-cyan)',
                            }}
                            title="View ATS keyword scan results"
                          >
                            🔍 ATS: {job.ats_coverage ?? job.ats_scan.coverage.overall_percentage}%
                          </button>
                        )}

                        {!applicationsMap[job.id] && (
                          <button
                            type="button"
                            onClick={() => handleTrackJob(job.id)}
                            className="btn btn-secondary"
                            style={{ padding: '0.375rem 0.65rem', fontSize: '0.75rem' }}
                            title="Track this job in Application Tracker"
                          >
                            📌 Track
                          </button>
                        )}
                      </>
                    )}

                    {/* Dismiss / Restore */}
                    {job.dismissed ? (
                      <button
                        type="button"
                        onClick={() => handleRestore(job.id)}
                        className="btn btn-secondary"
                        style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                        title="Restore Job to Active List"
                      >
                        Restore
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDismiss(job.id)}
                        className="btn btn-danger"
                        style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                        title="Dismiss Job"
                      >
                        ✕
                      </button>
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
                      <span>Model: <code>{job.scored_model ? formatShortModelName(job.scored_model) : 'AI Model'}</code></span>
                      {job.scored_at && (
                        <span>
                          Scored <LocalTime isoDate={job.scored_at} format="datetime" />
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Collapsible ATS Keyword Scan Drawer */}
                {viewingAtsJobId === job.id && (
                  <div style={{ marginTop: '0.75rem' }}>
                    {atsScanningJobId === job.id && !job.ats_scan ? (
                      <div
                        className="card"
                        style={{
                          padding: '1.5rem',
                          textAlign: 'center',
                          backgroundColor: 'var(--bg-secondary)',
                          color: 'var(--text-secondary)',
                          fontSize: '0.875rem',
                        }}
                      >
                        <span className="spinner" style={{ width: '16px', height: '16px', display: 'inline-block', marginRight: '0.5rem' }}></span>
                        Analyzing Job Description keywords & matching against resume...
                      </div>
                    ) : job.ats_scan ? (
                      <AtsScanSection
                        scanResult={job.ats_scan}
                        isStale={Boolean(atsScanStaleMap[job.id])}
                        onRescan={() => handleRunAtsScan(job.id, true)}
                        isRescanning={atsScanningJobId === job.id}
                      />
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tailored Outreach Modal (Phase 4) */}
      <OutreachModal
        job={outreachJob}
        isOpen={isOutreachModalOpen}
        onClose={() => setIsOutreachModalOpen(false)}
        onUpdate={handleOutreachUpdated}
      />
    </div>
  );
}
