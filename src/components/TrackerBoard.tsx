'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  updateApplicationStageAction,
  updateApplicationDetailsAction,
  snoozeFollowUpAction,
  untrackApplicationAction,
} from '@/app/tracker/actions';
import { ApplicationStage, getTodayIST, getDaysAheadIST, isFollowUpDue, StageHistoryEntry } from '@/lib/tracker/dates';
import { calculateTrackerMetrics } from '@/lib/tracker/metrics';
import { JobRecord } from '@/components/JobsList';
import { ScoreStatusBadge } from '@/components/ScoreStatusBadge';
import { SeniorityBadge } from '@/components/SeniorityBadge';
import { OutreachModal } from '@/components/OutreachModal';
import Link from 'next/link';

export interface ApplicationRecord {
  id: string;
  user_id: string;
  job_id: string;
  stage: ApplicationStage;
  applied_date: string | null;
  channel: 'company_site' | 'linkedin' | 'referral' | 'other' | string;
  referrer_name: string | null;
  next_follow_up_date: string | null;
  notes: string;
  stage_history: StageHistoryEntry[];
  created_at: string;
  updated_at: string;
  jobs: JobRecord;
}

interface TrackerBoardProps {
  initialApplications: ApplicationRecord[];
}

type TabFilter = 'all' | 'due' | 'saved' | 'referral_asked' | 'applied' | 'interviewing' | 'offer' | 'closed';
type SortOption = 'urgency' | 'newest' | 'score' | 'company';

export function TrackerBoard({ initialApplications }: TrackerBoardProps) {
  const [applications, setApplications] = useState<ApplicationRecord[]>(initialApplications);
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('urgency');

  // Expanded Notes map
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});
  const [savingNotesId, setSavingNotesId] = useState<string | null>(null);

  // Outreach Modal state
  const [outreachJob, setOutreachJob] = useState<JobRecord | null>(null);
  const [isOutreachOpen, setIsOutreachOpen] = useState(false);

  // Stage Change Prompt for referral_asked
  const [referralPromptApp, setReferralPromptApp] = useState<ApplicationRecord | null>(null);
  const [promptReferrerName, setPromptReferrerName] = useState('');

  // Notifications / feedback
  const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  const todayIST = getTodayIST();

  useEffect(() => {
    setApplications(initialApplications);
    const initialNotes: Record<string, string> = {};
    initialApplications.forEach((app) => {
      initialNotes[app.id] = app.notes || '';
    });
    setNotesDrafts(initialNotes);
  }, [initialApplications]);

  const showToast = (text: string, isError: boolean = false) => {
    setToastMessage({ text, isError });
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Metrics
  const metrics = calculateTrackerMetrics(applications, todayIST);

  // Follow-up due items
  const dueApplications = applications.filter((app) => isFollowUpDue(app, todayIST));

  // Handle stage change
  const handleStageSelect = async (app: ApplicationRecord, newStage: ApplicationStage) => {
    if (newStage === app.stage) return;

    if (newStage === 'referral_asked') {
      // Prompt for referrer name
      setPromptReferrerName(app.referrer_name || '');
      setReferralPromptApp(app);
      return;
    }

    const appliedDateDefault = newStage === 'applied' && !app.applied_date ? todayIST : app.applied_date;
    const followUpDefault =
      newStage === 'applied' && !app.next_follow_up_date
        ? getDaysAheadIST(7)
        : app.next_follow_up_date;

    // Optimistic update
    setApplications((prev) =>
      prev.map((item) =>
        item.id === app.id
          ? {
              ...item,
              stage: newStage,
              applied_date: appliedDateDefault,
              next_follow_up_date: followUpDefault,
              stage_history: [...item.stage_history, { stage: newStage, timestamp: new Date().toISOString() }],
              updated_at: new Date().toISOString(),
            }
          : item
      )
    );

    const res = await updateApplicationStageAction(app.id, newStage, {
      applied_date: appliedDateDefault || undefined,
    });

    if (res.success) {
      showToast(res.message || `Moved to ${newStage.replace('_', ' ')}.`);
    } else {
      showToast(res.error || 'Failed to update stage.', true);
      // Revert from server
      setApplications(initialApplications);
    }
  };

  const handleConfirmReferralStage = async () => {
    if (!referralPromptApp) return;
    const app = referralPromptApp;
    const referrer = promptReferrerName.trim() || undefined;
    const followUpDefault = !app.next_follow_up_date ? getDaysAheadIST(7) : app.next_follow_up_date;

    setReferralPromptApp(null);

    // Optimistic update
    setApplications((prev) =>
      prev.map((item) =>
        item.id === app.id
          ? {
              ...item,
              stage: 'referral_asked',
              referrer_name: referrer || null,
              channel: 'referral',
              next_follow_up_date: followUpDefault,
              stage_history: [...item.stage_history, { stage: 'referral_asked', timestamp: new Date().toISOString() }],
              updated_at: new Date().toISOString(),
            }
          : item
      )
    );

    const res = await updateApplicationStageAction(app.id, 'referral_asked', {
      referrer_name: referrer,
    });

    if (res.success) {
      // Also update channel to referral if not already
      if (referrer) {
        await updateApplicationDetailsAction(app.id, { channel: 'referral', referrer_name: referrer });
      }
      showToast(`Moved to Referral Asked (${referrer || 'No name specified'}).`);
    } else {
      showToast(res.error || 'Failed to update stage.', true);
      setApplications(initialApplications);
    }
  };

  // Handle Quick Snooze (+7 days)
  const handleSnooze = async (applicationId: string, days: number = 7) => {
    startTransition(async () => {
      const res = await snoozeFollowUpAction(applicationId, days);
      if (res.success) {
        showToast(res.message || 'Follow-up snoozed +7 days.');
      } else {
        showToast(res.error || 'Failed to snooze.', true);
      }
    });
  };

  // Handle Notes Save
  const handleSaveNotes = async (applicationId: string) => {
    const text = notesDrafts[applicationId] ?? '';
    setSavingNotesId(applicationId);
    const res = await updateApplicationDetailsAction(applicationId, { notes: text });
    setSavingNotesId(null);
    if (res.success) {
      setApplications((prev) =>
        prev.map((a) => (a.id === applicationId ? { ...a, notes: text } : a))
      );
      showToast('Notes saved.');
    } else {
      showToast(res.error || 'Failed to save notes.', true);
    }
  };

  // Handle Channel / Date updates
  const handleFieldUpdate = async (
    applicationId: string,
    fields: {
      channel?: string;
      referrer_name?: string | null;
      applied_date?: string | null;
      next_follow_up_date?: string | null;
    }
  ) => {
    setApplications((prev) =>
      prev.map((a) => (a.id === applicationId ? { ...a, ...fields } : a))
    );
    const res = await updateApplicationDetailsAction(applicationId, fields);
    if (!res.success) {
      showToast(res.error || 'Failed to update field.', true);
    }
  };

  // Handle Untrack
  const handleUntrack = async (applicationId: string, companyName: string) => {
    if (!confirm(`Remove ${companyName} from tracker?`)) return;
    setApplications((prev) => prev.filter((a) => a.id !== applicationId));
    const res = await untrackApplicationAction(applicationId);
    if (res.success) {
      showToast(res.message || 'Removed from tracker.');
    } else {
      showToast(res.error || 'Failed to untrack.', true);
    }
  };

  // Filter & Sort
  const filteredApps = applications.filter((app) => {
    // Tab filter
    if (activeTab === 'due') {
      if (!isFollowUpDue(app, todayIST)) return false;
    } else if (activeTab === 'closed') {
      if (app.stage !== 'rejected' && app.stage !== 'withdrawn') return false;
    } else if (activeTab !== 'all') {
      if (app.stage !== activeTab) return false;
    }

    // Search query
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const comp = (app.jobs?.company_name || '').toLowerCase();
      const title = (app.jobs?.title || '').toLowerCase();
      const ref = (app.referrer_name || '').toLowerCase();
      const notes = (app.notes || '').toLowerCase();
      if (!comp.includes(q) && !title.includes(q) && !ref.includes(q) && !notes.includes(q)) {
        return false;
      }
    }

    return true;
  }).sort((a, b) => {
    if (sortBy === 'urgency') {
      const aDue = isFollowUpDue(a, todayIST) ? 1 : 0;
      const bDue = isFollowUpDue(b, todayIST) ? 1 : 0;
      if (aDue !== bDue) return bDue - aDue;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    }
    if (sortBy === 'score') {
      const scoreA = a.jobs?.fit_score ?? -1;
      const scoreB = b.jobs?.fit_score ?? -1;
      return scoreB - scoreA;
    }
    if (sortBy === 'company') {
      return (a.jobs?.company_name || '').localeCompare(b.jobs?.company_name || '');
    }
    // newest
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Toast Notice */}
      {toastMessage && (
        <div
          className={`alert ${toastMessage.isError ? 'alert-error' : 'alert-success'}`}
          style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}
        >
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Top Header Card */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
            <h1 className="card-title" style={{ margin: 0 }}>Application Tracker</h1>
            <span className="badge badge-emerald">{metrics.totalTrackedCount} Tracked</span>
            {dueApplications.length > 0 && (
              <span className="badge badge-amber">
                🔔 {dueApplications.length} Action Due
              </span>
            )}
          </div>
          <p className="card-desc" style={{ margin: 0 }}>
            Track outreach stages, log referrer contacts, manage follow-ups (Asia/Kolkata), and monitor conversion.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Link href="/jobs" className="btn btn-secondary" style={{ fontSize: '0.8125rem' }}>
            ← Back to Jobs Feed
          </Link>
        </div>
      </div>

      {/* Top Metrics Banner */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
        }}
      >
        <div className="card" style={{ padding: '1rem 1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Active Pipeline
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-blue)', marginTop: '0.25rem' }}>
            {metrics.activePipelineCount}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Applied & Interviewing
          </span>
        </div>

        <div className="card" style={{ padding: '1rem 1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Applied This Week
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-cyan)', marginTop: '0.25rem' }}>
            {metrics.appliedThisWeekCount}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Last 7 days (IST)
          </span>
        </div>

        <div className="card" style={{ padding: '1rem 1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Response Rate
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#34d399', marginTop: '0.25rem' }}>
            {metrics.responseRatePct}%
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {metrics.totalEverRespondedCount} / {metrics.totalEverAppliedCount} apps ever reached interview
          </span>
        </div>

        <div className="card" style={{ padding: '1rem 1.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Referral Conversion
          </span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#818cf8', marginTop: '0.25rem' }}>
            {metrics.referralConversionRatePct}%
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {metrics.totalReferralConvertedCount} / {metrics.totalEverReferralAskedCount} converted to applied
          </span>
        </div>
      </div>

      {/* Follow-up Nudges Banner */}
      {dueApplications.length > 0 && (
        <div
          className="card"
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--accent-amber)' }}>
              🔔 {dueApplications.length} Application{dueApplications.length === 1 ? '' : 's'} Due for Follow-up
            </span>
            <button
              onClick={() => setActiveTab('due')}
              className="btn btn-secondary"
              style={{ padding: '0.25rem 0.625rem', fontSize: '0.75rem', borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)' }}
            >
              Filter Due Items
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {dueApplications.slice(0, 4).map((app) => (
              <div
                key={app.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: 'var(--bg-secondary)',
                  padding: '0.5rem 0.875rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8125rem',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <strong style={{ color: 'var(--text-primary)' }}>{app.jobs?.company_name}</strong>
                  <span style={{ color: 'var(--text-secondary)' }}> — {app.jobs?.title}</span>
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    ({app.stage.replace('_', ' ')}
                    {app.next_follow_up_date ? ` • scheduled ${app.next_follow_up_date}` : app.applied_date ? ` • applied ${app.applied_date}` : ''})
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => handleSnooze(app.id, 7)}
                    className="btn btn-secondary"
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                    title="Snooze follow up by 7 days in Asia/Kolkata"
                  >
                    +7d Snooze
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="card" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        {/* Stage Filter Pill Tabs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {[
            { id: 'all', label: `All (${applications.length})` },
            { id: 'due', label: `🔔 Action Due (${dueApplications.length})`, highlight: dueApplications.length > 0 },
            { id: 'saved', label: `Saved (${applications.filter((a) => a.stage === 'saved').length})` },
            { id: 'referral_asked', label: `Referral Asked (${applications.filter((a) => a.stage === 'referral_asked').length})` },
            { id: 'applied', label: `Applied (${applications.filter((a) => a.stage === 'applied').length})` },
            { id: 'interviewing', label: `Interviewing (${applications.filter((a) => a.stage === 'interviewing').length})` },
            { id: 'offer', label: `Offer (${applications.filter((a) => a.stage === 'offer').length})` },
            { id: 'closed', label: `Closed (${applications.filter((a) => a.stage === 'rejected' || a.stage === 'withdrawn').length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabFilter)}
              className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.8125rem',
                borderColor: tab.highlight && activeTab !== tab.id ? 'var(--accent-amber)' : undefined,
                color: tab.highlight && activeTab !== tab.id ? 'var(--accent-amber)' : undefined,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Sort Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <input
            type="text"
            className="input"
            placeholder="Search company, title, referrer, notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ flex: 1, minWidth: '220px', maxWidth: '380px', padding: '0.45rem 0.75rem', fontSize: '0.875rem' }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Sort by:</label>
            <select
              className="input"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.875rem', cursor: 'pointer' }}
            >
              <option value="urgency">Urgency / Action Due</option>
              <option value="newest">Recently Updated</option>
              <option value="score">Fit Score</option>
              <option value="company">Company Name</option>
            </select>
          </div>
        </div>
      </div>

      {/* Applications List */}
      {filteredApps.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '1.125rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem' }}>
            No tracked applications match this filter.
          </p>
          <p style={{ fontSize: '0.875rem', margin: 0 }}>
            {applications.length === 0
              ? 'Visit the Jobs feed to track target roles into your pipeline.'
              : 'Try changing the stage filter tab or search query.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredApps.map((app) => {
            const isDue = isFollowUpDue(app, todayIST);
            const isNotesExpanded = Boolean(expandedNotes[app.id]);
            const noteText = notesDrafts[app.id] ?? (app.notes || '');

            return (
              <div
                key={app.id}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.875rem',
                  padding: '1.25rem 1.5rem',
                  borderLeft: isDue ? '4px solid var(--accent-amber)' : undefined,
                }}
              >
                {/* Header Row: Company, Title, Badges, Stage Selector */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ flex: 1, minWidth: '280px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <h3 style={{ fontSize: '1.125rem', color: 'var(--text-primary)', margin: 0 }}>
                        {app.jobs?.company_name}
                      </h3>
                      <span style={{ color: 'var(--text-muted)' }}>•</span>
                      <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {app.jobs?.title}
                      </span>
                      {app.jobs?.fit_score != null && (
                        <span className="badge badge-emerald" style={{ fontSize: '0.75rem' }}>
                          Fit: {app.jobs.fit_score}/100
                        </span>
                      )}
                      <SeniorityBadge seniority={app.jobs?.seniority_match} />
                      {isDue && (
                        <span className="badge badge-amber" style={{ fontSize: '0.6875rem' }}>
                          🔔 Follow-up Due
                        </span>
                      )}
                      {app.jobs?.dismissed && (
                        <span className="badge" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                          Feed Dismissed
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      <span>📍 {app.jobs?.location}</span>
                      <span>•</span>
                      <a href={app.jobs?.job_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-cyan)' }}>
                        Job Link ↗
                      </a>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={() => {
                          setOutreachJob(app.jobs);
                          setIsOutreachOpen(true);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#818cf8',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: 'inherit',
                          fontWeight: 500,
                        }}
                      >
                        ✍️ Cover Note & Referral
                      </button>
                    </div>
                  </div>

                  {/* Stage Dropdown Selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Stage:</label>
                    <select
                      className="input"
                      value={app.stage}
                      onChange={(e) => handleStageSelect(app, e.target.value as ApplicationStage)}
                      style={{
                        padding: '0.4rem 0.75rem',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        borderColor:
                          app.stage === 'offer'
                            ? '#34d399'
                            : app.stage === 'interviewing'
                            ? 'var(--accent-blue)'
                            : app.stage === 'applied'
                            ? 'var(--accent-cyan)'
                            : undefined,
                      }}
                    >
                      <option value="saved">Saved</option>
                      <option value="referral_asked">Referral Asked</option>
                      <option value="applied">Applied</option>
                      <option value="interviewing">Interviewing</option>
                      <option value="offer">🎉 Offer</option>
                      <option value="rejected">Rejected</option>
                      <option value="withdrawn">Withdrawn</option>
                    </select>

                    <button
                      onClick={() => handleUntrack(app.id, app.jobs?.company_name || 'job')}
                      className="btn btn-secondary"
                      style={{ padding: '0.375rem 0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}
                      title="Remove from tracker"
                    >
                      🗑
                    </button>
                  </div>
                </div>

                {/* Application Metadata Fields Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                    gap: '0.75rem',
                    backgroundColor: 'var(--bg-secondary)',
                    padding: '0.875rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {/* Channel */}
                  <div>
                    <label className="label" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                      Application Channel
                    </label>
                    <select
                      className="input"
                      value={app.channel || 'company_site'}
                      onChange={(e) => handleFieldUpdate(app.id, { channel: e.target.value })}
                      style={{ padding: '0.35rem 0.6rem', fontSize: '0.8125rem', width: '100%' }}
                    >
                      <option value="company_site">Company Site</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="referral">Referral</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  {/* Referrer Name */}
                  <div>
                    <label className="label" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                      Referrer / Contact
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. Rahul Sharma"
                      value={app.referrer_name || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setApplications((prev) =>
                          prev.map((a) => (a.id === app.id ? { ...a, referrer_name: val } : a))
                        );
                      }}
                      onBlur={(e) => handleFieldUpdate(app.id, { referrer_name: e.target.value.trim() || null })}
                      style={{ padding: '0.35rem 0.6rem', fontSize: '0.8125rem', width: '100%' }}
                    />
                  </div>

                  {/* Applied Date */}
                  <div>
                    <label className="label" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                      Applied Date (IST)
                    </label>
                    <input
                      type="date"
                      className="input"
                      value={app.applied_date || ''}
                      onChange={(e) => handleFieldUpdate(app.id, { applied_date: e.target.value || null })}
                      style={{ padding: '0.35rem 0.6rem', fontSize: '0.8125rem', width: '100%' }}
                    />
                  </div>

                  {/* Next Follow-Up Date */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                      <label className="label" style={{ fontSize: '0.7rem', color: isDue ? 'var(--accent-amber)' : 'var(--text-muted)', margin: 0 }}>
                        Next Follow-Up
                      </label>
                      <button
                        type="button"
                        onClick={() => handleSnooze(app.id, 7)}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', fontSize: '0.6875rem', cursor: 'pointer', padding: 0 }}
                      >
                        +7d
                      </button>
                    </div>
                    <input
                      type="date"
                      className="input"
                      value={app.next_follow_up_date || ''}
                      onChange={(e) => handleFieldUpdate(app.id, { next_follow_up_date: e.target.value || null })}
                      style={{
                        padding: '0.35rem 0.6rem',
                        fontSize: '0.8125rem',
                        width: '100%',
                        borderColor: isDue ? 'var(--accent-amber)' : undefined,
                      }}
                    />
                  </div>
                </div>

                {/* Notes Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedNotes((prev) => ({ ...prev, [app.id]: !prev[app.id] }))
                      }
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        fontSize: '0.8125rem',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      <span>📝 Notes {app.notes ? `(${app.notes.length} chars)` : ''}</span>
                      <span>{isNotesExpanded ? '▲' : '▼'}</span>
                    </button>

                    {isNotesExpanded && (
                      <button
                        type="button"
                        onClick={() => handleSaveNotes(app.id)}
                        disabled={savingNotesId === app.id}
                        className="btn btn-secondary"
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        {savingNotesId === app.id ? 'Saving...' : 'Save Notes'}
                      </button>
                    )}
                  </div>

                  {isNotesExpanded && (
                    <textarea
                      className="textarea"
                      rows={3}
                      placeholder="Add recruiter names, interview timeline, interview questions, follow-up notes..."
                      value={noteText}
                      onChange={(e) =>
                        setNotesDrafts((prev) => ({ ...prev, [app.id]: e.target.value }))
                      }
                      style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Referrer Name Prompt Dialog Modal */}
      {referralPromptApp && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(10, 14, 23, 0.85)',
            backdropFilter: 'blur(6px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '460px',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
            }}
          >
            <h3 className="card-title" style={{ margin: 0 }}>
              Move to Referral Asked
            </h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: 0 }}>
              Who are you asking for a referral at <strong>{referralPromptApp.jobs?.company_name}</strong>?
            </p>

            <div>
              <label className="label" style={{ fontSize: '0.75rem' }}>
                Referrer Name / LinkedIn Contact (Optional)
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Rahul Sharma (Senior PM)"
                value={promptReferrerName}
                onChange={(e) => setPromptReferrerName(e.target.value)}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setReferralPromptApp(null)}
                className="btn btn-secondary"
                style={{ fontSize: '0.8125rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReferralStage}
                className="btn btn-primary"
                style={{ fontSize: '0.8125rem' }}
              >
                Save & Set Stage
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Outreach Drawer */}
      <OutreachModal
        job={outreachJob}
        isOpen={isOutreachOpen}
        onClose={() => setIsOutreachOpen(false)}
        onUpdate={(jobId, cover, refMsg, lastCover, lastRef, model, updated) => {
          setApplications((prev) =>
            prev.map((app) =>
              app.job_id === jobId
                ? {
                    ...app,
                    jobs: {
                      ...app.jobs,
                      cover_note: cover,
                      referral_message: refMsg,
                      last_generated_cover_note: lastCover,
                      last_generated_referral: lastRef,
                      outreach_model: model,
                      outreach_updated_at: updated,
                    },
                  }
                : app
            )
          );
        }}
      />
    </div>
  );
}
