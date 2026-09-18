interface ScoreStatusBadgeProps {
  status: 'pending' | 'scored' | 'failed' | string;
  fitScore?: number | null;
  scoreError?: string | null;
}

export function ScoreStatusBadge({ status, fitScore, scoreError }: ScoreStatusBadgeProps) {
  if (status === 'scored' && fitScore !== undefined && fitScore !== null) {
    const isHigh = fitScore >= 75;
    const isMid = fitScore >= 50;
    const badgeClass = isHigh ? 'badge-emerald' : isMid ? 'badge-amber' : 'badge-rose';

    return (
      <span className={`badge ${badgeClass}`}>
        Fit: {fitScore}/100
      </span>
    );
  }

  if (status === 'failed') {
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
        <span className="badge badge-rose">
          Scoring Failed
        </span>
        {scoreError && (
          <span
            style={{
              fontSize: '0.6875rem',
              color: '#f87171',
              maxWidth: '320px',
              wordBreak: 'break-word',
              lineHeight: 1.3,
            }}
            title={scoreError}
          >
            {scoreError.length > 90 ? scoreError.slice(0, 87) + '...' : scoreError}
          </span>
        )}
      </div>
    );
  }

  return (
    <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }}>
      Pending Score
    </span>
  );
}
