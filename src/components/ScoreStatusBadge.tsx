interface ScoreStatusBadgeProps {
  status: 'pending' | 'scored' | 'failed' | string;
  fitScore?: number | null;
}

export function ScoreStatusBadge({ status, fitScore }: ScoreStatusBadgeProps) {
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
      <span className="badge badge-rose">
        Scoring Failed
      </span>
    );
  }

  return (
    <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }}>
      Pending Score
    </span>
  );
}
