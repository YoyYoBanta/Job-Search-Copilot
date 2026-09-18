'use client';

import { useState, useEffect } from 'react';
import { generateOutreachAction, saveOutreachDraftAction } from '@/app/jobs/actions';
import { countWords } from '@/lib/tailor/validator';
import { LocalTime } from '@/components/LocalTime';
import { JobRecord } from '@/components/JobsList';

interface OutreachModalProps {
  job: JobRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (jobId: string, coverNote: string, referralMessage: string, outreachUpdatedAt: string) => void;
}

export function OutreachModal({ job, isOpen, onClose, onUpdate }: OutreachModalProps) {
  const [coverNote, setCoverNote] = useState('');
  const [referralMessage, setReferralMessage] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'cover' | 'referral' | null>(null);

  useEffect(() => {
    if (job && isOpen) {
      setError(null);
      setSuccessNotice(null);
      setCoverNote(job.cover_note || '');
      setReferralMessage(job.referral_message || '');
      setLastSavedAt(job.outreach_updated_at || null);

      // Auto-generate if not already generated
      if (!job.cover_note && !job.referral_message) {
        handleGenerate(false);
      }
    }
  }, [job?.id, isOpen]);

  if (!isOpen || !job) return null;

  const handleGenerate = async (force: boolean) => {
    setIsLoading(true);
    setError(null);
    setSuccessNotice(null);

    try {
      const res = await generateOutreachAction(job.id, force);
      if (res.success && res.cover_note && res.referral_message) {
        setCoverNote(res.cover_note);
        setReferralMessage(res.referral_message);
        setLastSavedAt(res.outreach_updated_at || new Date().toISOString());
        onUpdate(job.id, res.cover_note, res.referral_message, res.outreach_updated_at || new Date().toISOString());
        if (force) {
          setSuccessNotice('Fresh outreach copy generated!');
          setTimeout(() => setSuccessNotice(null), 4000);
        }
      } else {
        setError(res.error || 'Failed to generate outreach copy.');
      }
    } catch (err: any) {
      setError(err?.message || 'Unexpected generation error.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessNotice(null);

    try {
      const res = await saveOutreachDraftAction(job.id, coverNote, referralMessage);
      if (res.success) {
        const nowIso = res.outreach_updated_at || new Date().toISOString();
        setLastSavedAt(nowIso);
        onUpdate(job.id, coverNote, referralMessage, nowIso);
        setSuccessNotice('Draft changes saved!');
        setTimeout(() => setSuccessNotice(null), 3000);
      } else {
        setError(res.error || 'Failed to save changes.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async (field: 'cover' | 'referral', text: string) => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2500);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const coverWords = countWords(coverNote);
  const referralWords = countWords(referralMessage);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(10, 14, 23, 0.82)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '850px',
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          border: '1px solid var(--border-accent)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span className="badge badge-emerald">Seniority Fit</span>
              <span className="badge" style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
                Phase 4 Tailored Outreach
              </span>
            </div>
            <h2 className="card-title" style={{ fontSize: '1.375rem' }}>
              {job.title} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>at</span> {job.company_name}
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.125rem' }}>
              {job.location} {lastSavedAt && (
                <>• Last saved <LocalTime isoDate={lastSavedAt} format="datetime" /></>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '0.375rem 0.625rem', fontSize: '1rem', lineHeight: 1 }}
            title="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Notices */}
        {error && (
          <div className="alert alert-error" style={{ margin: 0, padding: '0.75rem 1rem' }}>
            <span>{error}</span>
          </div>
        )}

        {successNotice && (
          <div className="alert alert-success" style={{ margin: 0, padding: '0.75rem 1rem' }}>
            <span>{successNotice}</span>
          </div>
        )}

        {isLoading ? (
          <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                border: '3px solid rgba(99, 102, 241, 0.2)',
                borderTopColor: '#6366f1',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 1rem',
              }}
            />
            <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Drafting tailored outreach copy...</p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Grounding in candidate resume and match analysis strengths without clichés.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Section 1: Cover Note */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label className="label" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    Tailored Cover Note
                  </label>
                  <span style={{ fontSize: '0.75rem', color: coverWords > 180 ? 'var(--accent-rose)' : 'var(--text-muted)' }}>
                    ({coverWords} words • target ~150)
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleCopy('cover', coverNote)}
                  className="btn btn-secondary"
                  style={{
                    padding: '0.375rem 0.75rem',
                    fontSize: '0.75rem',
                    borderColor: copiedField === 'cover' ? 'var(--accent-emerald)' : undefined,
                    color: copiedField === 'cover' ? 'var(--accent-emerald)' : undefined,
                  }}
                  disabled={!coverNote.trim()}
                >
                  {copiedField === 'cover' ? '✓ Copied!' : '📋 Copy Cover Note'}
                </button>
              </div>

              <textarea
                className="textarea"
                rows={6}
                value={coverNote}
                onChange={(e) => setCoverNote(e.target.value)}
                placeholder="Cover note will appear here..."
                style={{ minHeight: '140px', fontSize: '0.875rem', lineHeight: '1.6' }}
              />
            </div>

            {/* Section 2: LinkedIn Referral Message */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label className="label" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    LinkedIn Referral Request
                  </label>
                  <span style={{ fontSize: '0.75rem', color: referralWords > 100 ? 'var(--accent-rose)' : 'var(--text-muted)' }}>
                    ({referralWords} words • target ~80)
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleCopy('referral', referralMessage)}
                  className="btn btn-secondary"
                  style={{
                    padding: '0.375rem 0.75rem',
                    fontSize: '0.75rem',
                    borderColor: copiedField === 'referral' ? 'var(--accent-emerald)' : undefined,
                    color: copiedField === 'referral' ? 'var(--accent-emerald)' : undefined,
                  }}
                  disabled={!referralMessage.trim()}
                >
                  {copiedField === 'referral' ? '✓ Copied!' : '📋 Copy Referral DM'}
                </button>
              </div>

              <textarea
                className="textarea"
                rows={4}
                value={referralMessage}
                onChange={(e) => setReferralMessage(e.target.value)}
                placeholder="LinkedIn referral message will appear here..."
                style={{ minHeight: '100px', fontSize: '0.875rem', lineHeight: '1.6' }}
              />
            </div>

            {/* Footer Action Bar */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid var(--border-subtle)',
                paddingTop: '1rem',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <button
                type="button"
                onClick={() => handleGenerate(true)}
                className="btn btn-secondary"
                disabled={isLoading || isSaving}
                title="Regenerate fresh drafts with AI"
              >
                🔄 Regenerate Drafts
              </button>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-secondary"
                  disabled={isLoading || isSaving}
                >
                  Done
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  className="btn btn-primary"
                  disabled={isLoading || isSaving || (!coverNote && !referralMessage)}
                >
                  {isSaving ? 'Saving...' : 'Save Drafts'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
