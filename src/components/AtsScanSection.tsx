'use client';

import React, { useState } from 'react';
import { AtsScanResult } from '@/lib/ats-scanner/types';
import { formatShortModelName } from '@/lib/groq/config';
import { LocalTime } from '@/components/LocalTime';

interface AtsScanSectionProps {
  scanResult: AtsScanResult;
  isStale?: boolean;
  onRescan: () => void;
  isRescanning?: boolean;
}

export function AtsScanSection({
  scanResult,
  isStale = false,
  onRescan,
  isRescanning = false,
}: AtsScanSectionProps) {
  const [copiedBulletIdx, setCopiedBulletIdx] = useState<number | null>(null);

  const {
    coverage,
    matched_terms,
    missing_terms,
    title_alignment,
    scanned_at,
    model_used,
  } = scanResult;

  const handleCopyBullet = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedBulletIdx(idx);
    setTimeout(() => setCopiedBulletIdx(null), 2500);
  };

  const hardSkills = matched_terms.filter((t) => t.category === 'hard_skill');
  const tools = matched_terms.filter((t) => t.category === 'tool');
  const domains = matched_terms.filter((t) => t.category === 'domain');
  const softSkills = matched_terms.filter((t) => t.category === 'soft_skill');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        padding: '1.25rem',
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Disclaimer */}
      <div
        style={{
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          fontStyle: 'italic',
          padding: '0.4rem 0.75rem',
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          borderRadius: '4px',
          borderLeft: '3px solid var(--text-muted)',
        }}
      >
        💡 Keywords only help if the underlying experience is real.
      </div>

      {/* Stale Scan Alert */}
      {isStale && (
        <div
          className="alert alert-warning"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.65rem 0.85rem',
            fontSize: '0.8125rem',
          }}
        >
          <span>⚠️ Resume updated since this scan — re-scan for current results.</span>
          <button
            type="button"
            onClick={onRescan}
            disabled={isRescanning}
            className="btn btn-primary"
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', fontWeight: 600 }}
          >
            {isRescanning ? 'Scanning...' : '🔄 Re-scan Now'}
          </button>
        </div>
      )}

      {/* Header & Coverage Progress Bar */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.5rem',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
              🔍 ATS Keyword Scanner
            </span>
            <span
              className="badge"
              style={{
                backgroundColor:
                  coverage.overall_percentage >= 70
                    ? 'rgba(52, 211, 153, 0.15)'
                    : coverage.overall_percentage >= 45
                    ? 'rgba(251, 191, 36, 0.15)'
                    : 'rgba(248, 113, 113, 0.15)',
                color:
                  coverage.overall_percentage >= 70
                    ? '#34d399'
                    : coverage.overall_percentage >= 45
                    ? '#fbbf24'
                    : '#f87171',
                fontWeight: 700,
              }}
            >
              {coverage.overall_percentage}% Overall Match
            </span>
          </div>

          <button
            type="button"
            onClick={onRescan}
            disabled={isRescanning}
            className={`btn ${isStale ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
            title="Re-run ATS keyword scan against current master resume"
          >
            {isRescanning ? 'Scanning...' : '🔄 Re-scan'}
          </button>
        </div>

        {/* Dual Progress Breakdown */}
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            fontSize: '0.8125rem',
            color: 'var(--text-secondary)',
            marginBottom: '0.5rem',
            flexWrap: 'wrap',
          }}
        >
          <span>
            <strong>Required:</strong> {coverage.required_matched}/{coverage.required_total}
          </span>
          <span>•</span>
          <span>
            <strong>Preferred:</strong> {coverage.preferred_matched}/{coverage.preferred_total}
          </span>
        </div>

        {/* Visual Progress Bar */}
        <div
          style={{
            width: '100%',
            height: '8px',
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '999px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${coverage.overall_percentage}%`,
              height: '100%',
              backgroundColor:
                coverage.overall_percentage >= 70
                  ? '#34d399'
                  : coverage.overall_percentage >= 45
                  ? '#fbbf24'
                  : '#f87171',
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      </div>

      {/* Matched Terms Section */}
      <div>
        <h4
          style={{
            fontSize: '0.8125rem',
            color: '#34d399',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: '0 0 0.65rem',
          }}
        >
          ✅ Matched Keywords ({matched_terms.length})
        </h4>

        {matched_terms.length === 0 ? (
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>
            No exact matching keywords found in current resume.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {hardSkills.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '85px' }}>
                  Hard Skills:
                </span>
                {hardSkills.map((t, i) => (
                  <span
                    key={i}
                    className="badge badge-emerald"
                    style={{ fontSize: '0.75rem' }}
                    title={t.found_in_resume ? `Found: "${t.found_in_resume}"` : undefined}
                  >
                    {t.term} {t.importance === 'required' ? '★' : ''}
                  </span>
                ))}
              </div>
            )}

            {tools.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '85px' }}>
                  Tools & Tech:
                </span>
                {tools.map((t, i) => (
                  <span
                    key={i}
                    className="badge badge-blue"
                    style={{ fontSize: '0.75rem' }}
                    title={t.found_in_resume ? `Found: "${t.found_in_resume}"` : undefined}
                  >
                    {t.term} {t.importance === 'required' ? '★' : ''}
                  </span>
                ))}
              </div>
            )}

            {domains.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '85px' }}>
                  Domain:
                </span>
                {domains.map((t, i) => (
                  <span
                    key={i}
                    className="badge badge-cyan"
                    style={{ fontSize: '0.75rem' }}
                    title={t.found_in_resume ? `Found: "${t.found_in_resume}"` : undefined}
                  >
                    {t.term} {t.importance === 'required' ? '★' : ''}
                  </span>
                ))}
              </div>
            )}

            {softSkills.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '85px' }}>
                  Soft Skills:
                </span>
                {softSkills.map((t, i) => (
                  <span
                    key={i}
                    className="badge badge-gray"
                    style={{ fontSize: '0.75rem' }}
                    title={t.found_in_resume ? `Found: "${t.found_in_resume}"` : undefined}
                  >
                    {t.term} {t.importance === 'required' ? '★' : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Missing Terms: Add These Words (With verified rewrites) */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
          <h4
            style={{
              fontSize: '0.8125rem',
              color: 'var(--accent-cyan)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              margin: 0,
            }}
          >
            ✏️ Add These Words ({missing_terms.add_these_words.length})
          </h4>
          <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
            (Evidence exists in resume under different phrasing)
          </span>
        </div>

        {missing_terms.add_these_words.length === 0 ? (
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>
            No missing terms with existing resume evidence.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {missing_terms.add_these_words.map((item, idx) => (
              <div
                key={idx}
                style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                {/* Term & Importance Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                      &quot;{item.term}&quot;
                    </strong>
                    <span
                      className={`badge ${
                        item.importance === 'required' ? 'badge-rose' : 'badge-gray'
                      }`}
                      style={{ fontSize: '0.65rem' }}
                    >
                      {item.importance === 'required' ? 'Required' : 'Preferred'}
                    </span>
                    <span className="badge badge-gray" style={{ fontSize: '0.65rem' }}>
                      {item.category.replace('_', ' ')}
                    </span>
                  </div>

                  {item.suggested_rewrite && item.rewrite_verified && (
                    <button
                      type="button"
                      onClick={() => handleCopyBullet(item.suggested_rewrite!, idx)}
                      className="btn btn-secondary"
                      style={{
                        padding: '0.2rem 0.5rem',
                        fontSize: '0.75rem',
                        color: copiedBulletIdx === idx ? '#34d399' : 'var(--accent-blue)',
                        borderColor: copiedBulletIdx === idx ? '#34d399' : undefined,
                      }}
                      title="Copy rewritten bullet to clipboard"
                    >
                      {copiedBulletIdx === idx ? '✓ Copied!' : '📋 Copy Rewritten Bullet'}
                    </button>
                  )}
                </div>

                {/* Reason */}
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {item.reason}
                </p>

                {/* Rewritten Bullet if Verified */}
                {item.suggested_rewrite && item.rewrite_verified ? (
                  <div
                    style={{
                      padding: '0.5rem 0.75rem',
                      backgroundColor: 'rgba(59, 130, 246, 0.08)',
                      borderLeft: '3px solid var(--accent-blue)',
                      borderRadius: '0 4px 4px 0',
                      fontSize: '0.8125rem',
                      color: 'var(--text-primary)',
                      lineHeight: 1.4,
                    }}
                  >
                    <strong>Suggested Rewrite:</strong> {item.suggested_rewrite}
                  </div>
                ) : null}

                {/* Original Quoted Bullet */}
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    fontStyle: 'italic',
                  }}
                >
                  Based on your resume bullet: &quot;{item.supporting_resume_bullet}&quot;
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Missing Terms: Do Not Claim */}
      <div>
        <h4
          style={{
            fontSize: '0.8125rem',
            color: '#f87171',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: '0 0 0.65rem',
          }}
        >
          🚫 Do Not Claim ({missing_terms.do_not_claim.length})
        </h4>

        {missing_terms.do_not_claim.length === 0 ? (
          <p style={{ fontSize: '0.8125rem', color: '#34d399', margin: 0 }}>
            No unsupported requirements identified.
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {missing_terms.do_not_claim.map((item, idx) => (
              <span
                key={idx}
                className="badge"
                style={{
                  backgroundColor: 'rgba(248, 113, 113, 0.1)',
                  color: '#f87171',
                  border: '1px solid rgba(248, 113, 113, 0.25)',
                  fontSize: '0.75rem',
                  padding: '0.3rem 0.6rem',
                }}
                title={item.reason}
              >
                {item.term} ({item.importance === 'required' ? 'Required' : 'Preferred'})
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Title Alignment Card */}
      {title_alignment && (
        <div
          style={{
            padding: '0.85rem 1rem',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <h4
            style={{
              fontSize: '0.8125rem',
              color: 'var(--text-primary)',
              margin: '0 0 0.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            🎯 Title & Headline Alignment
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8125rem' }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Target Role:</span>{' '}
              <strong>{title_alignment.target_title}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Truthful Suggested Headline:</span>{' '}
              <strong style={{ color: 'var(--accent-cyan)' }}>{title_alignment.suggested_headline}</strong>
            </div>
            {title_alignment.rationale && (
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {title_alignment.rationale}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Footer metadata */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.6875rem',
          color: 'var(--text-muted)',
          borderTop: '1px solid var(--border-subtle)',
          paddingTop: '0.5rem',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <span>
          Scanned with <code>{formatShortModelName(model_used)}</code>
        </span>
        {scanned_at && (
          <span>
            Scanned <LocalTime isoDate={scanned_at} format="datetime" />
          </span>
        )}
      </div>
    </div>
  );
}
