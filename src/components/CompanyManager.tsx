'use client';

import { useActionState, useState } from 'react';
import {
  addCompanyAction,
  deleteCompanyAction,
  triggerFetchForCompany,
  triggerFetchAllCompanies,
  type CompanyActionState,
} from '@/app/companies/actions';
import { CompanyRecord, IngestionMetrics } from '@/lib/ats/types';
import { LocalTime } from '@/components/LocalTime';
import Link from 'next/link';

interface CompanyManagerProps {
  initialCompanies: CompanyRecord[];
}

export function CompanyManager({ initialCompanies }: CompanyManagerProps) {
  const [addState, formAction, isAdding] = useActionState<CompanyActionState, FormData>(
    addCompanyAction,
    {}
  );

  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [isFetchingAll, setIsFetchingAll] = useState<boolean>(false);
  const [fetchMetrics, setFetchMetrics] = useState<IngestionMetrics[] | null>(null);

  const handleFetchOne = async (companyId: string) => {
    setFetchingId(companyId);
    setFetchMetrics(null);
    try {
      const metric = await triggerFetchForCompany(companyId);
      setFetchMetrics([metric]);
    } catch (err) {
      console.error(err);
    } finally {
      setFetchingId(null);
    }
  };

  const handleFetchAll = async () => {
    if (initialCompanies.length === 0) return;
    setIsFetchingAll(true);
    setFetchMetrics(null);
    try {
      const metrics = await triggerFetchAllCompanies();
      setFetchMetrics(metrics);
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetchingAll(false);
    }
  };

  const totalNew = fetchMetrics ? fetchMetrics.reduce((acc, m) => acc + m.newInserted, 0) : 0;
  const totalPassed = fetchMetrics ? fetchMetrics.reduce((acc, m) => acc + m.passedFilter, 0) : 0;
  const totalFetched = fetchMetrics ? fetchMetrics.reduce((acc, m) => acc + m.totalFetched, 0) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Top Header & Bulk Fetch Bar */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="card-title">Target Companies & ATS Ingestion</h1>
          <p className="card-desc">
            Configure public ATS boards (Greenhouse, Lever, Ashby). Fetching pulls openings, keeps only Product roles in India/Remote, and deduplicates by URL.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/jobs" className="btn btn-secondary">
            View Ingested Jobs →
          </Link>
          <button
            onClick={handleFetchAll}
            className="btn btn-primary"
            disabled={isFetchingAll || initialCompanies.length === 0}
          >
            {isFetchingAll ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                Fetching All Feeds...
              </>
            ) : (
              '⚡ Fetch All Boards'
            )}
          </button>
        </div>
      </div>

      {/* Ingestion Results Alert */}
      {fetchMetrics && (
        <div className="card" style={{ borderColor: 'var(--accent-blue)', backgroundColor: 'rgba(59, 130, 246, 0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-emerald">Ingestion Complete</span>
              <span>Found {totalFetched} raw openings across feeds</span>
            </h3>
            <button
              onClick={() => setFetchMetrics(null)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Filtered Product Roles</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{totalPassed}</div>
            </div>
            <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>New Jobs Added</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-emerald)' }}>+{totalNew}</div>
            </div>
            <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Duplicates Skipped</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-muted)' }}>{totalPassed - totalNew}</div>
            </div>
          </div>

          {/* Breakdown per company */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {fetchMetrics.map((m, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)' }}>
                <span><strong>{m.companyName}</strong> ({m.boardType}/{m.companySlug})</span>
                {m.error ? (
                  <span style={{ color: 'var(--accent-rose)' }}>Error: {m.error}</span>
                ) : (
                  <span>{m.totalFetched} fetched → {m.passedFilter} matched filter → <strong>{m.newInserted} new saved</strong></span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid: Companies List (Left) and Add Form (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', alignItems: 'flex-start' }}>
        
        {/* Companies List */}
        <div className="card">
          <h2 className="card-title" style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>
            Target Companies ({initialCompanies.length})
          </h2>

          {initialCompanies.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
              <p>No target companies added yet.</p>
              <p style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>
                Add your first company board on the right (e.g. Razorpay, Swiggy, Cred).
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {initialCompanies.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '1rem',
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>{c.name}</strong>
                      <span className="badge" style={{ textTransform: 'capitalize', backgroundColor: 'var(--bg-tertiary)' }}>
                        {c.board_type}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Slug: <code>{c.slug}</code> • Added <LocalTime isoDate={c.created_at} format="date" />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleFetchOne(c.id)}
                      className="btn btn-secondary"
                      style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                      disabled={fetchingId === c.id || isFetchingAll}
                    >
                      {fetchingId === c.id ? 'Fetching...' : 'Fetch'}
                    </button>

                    <form action={deleteCompanyAction}>
                      <input type="hidden" name="company_id" value={c.id} />
                      <button
                        type="submit"
                        className="btn btn-danger"
                        style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                        title="Delete Company"
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

        {/* Add Company Form */}
        <div className="card">
          <h2 className="card-title" style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>
            Add Target Company
          </h2>
          <p className="card-desc" style={{ marginBottom: '1.25rem' }}>
            Enter company board slug (from the ATS board URL) and select the platform.
          </p>

          {addState?.error && (
            <div className="alert alert-error" role="alert">
              <span>{addState.error}</span>
            </div>
          )}

          {addState?.success && (
            <div className="alert alert-success" role="alert">
              <span>{addState.message}</span>
            </div>
          )}

          <form action={formAction}>
            <div className="form-group">
              <label className="label" htmlFor="name">
                Company Display Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                className="input"
                placeholder="e.g. Stripe, Razorpay, Zepto"
                disabled={isAdding}
              />
            </div>

            <div className="form-group">
              <label className="label" htmlFor="board_type">
                ATS Board Platform
              </label>
              <select
                id="board_type"
                name="board_type"
                required
                className="input"
                defaultValue="greenhouse"
                disabled={isAdding}
              >
                <option value="greenhouse">Greenhouse (boards-api.greenhouse.io)</option>
                <option value="lever">Lever (api.lever.co)</option>
                <option value="ashby">Ashby (api.ashbyhq.com)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="label" htmlFor="slug">
                Board Slug / Identifier
              </label>
              <input
                id="slug"
                name="slug"
                type="text"
                required
                className="input"
                placeholder="e.g. stripe or razorpaysoftwareprivatelimited"
                disabled={isAdding}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                The identifier in <code>boards.greenhouse.io/&#123;slug&#125;</code> or <code>jobs.lever.co/&#123;slug&#125;</code>
              </span>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '0.5rem' }}
              disabled={isAdding}
            >
              {isAdding ? 'Adding Company...' : '+ Add Company Board'}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
