'use client';

import React, { useState, useTransition } from 'react';
import {
  addSearchQueryAction,
  toggleSearchQueryAction,
  deleteSearchQueryAction,
  SearchQueryRecord,
} from '@/app/companies/actions';

interface SearchQueriesSectionProps {
  initialQueries: SearchQueryRecord[];
}

export function SearchQueriesSection({ initialQueries }: SearchQueriesSectionProps) {
  const [queries, setQueries] = useState<SearchQueryRecord[]>(initialQueries);
  const [newQueryText, setNewQueryText] = useState('');
  const [country, setCountry] = useState('in');
  const [datePosted, setDatePosted] = useState('week');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleAddQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append('query', newQueryText);
    formData.append('country', country);
    formData.append('date_posted', datePosted);

    startTransition(async () => {
      const result = await addSearchQueryAction(null, formData);
      if (result.error) {
        setErrorMessage(result.error);
      } else if (result.success) {
        setSuccessMessage(result.message || 'Search query added successfully!');
        setNewQueryText('');
        if (result.query) {
          setQueries((prev) => [...prev, result.query!]);
        }
      }
    });
  };

  const handleToggle = (queryId: string, currentEnabled: boolean) => {
    const nextEnabled = !currentEnabled;
    setQueries((prev) =>
      prev.map((q) => (q.id === queryId ? { ...q, enabled: nextEnabled } : q))
    );

    startTransition(async () => {
      const result = await toggleSearchQueryAction(queryId, nextEnabled);
      if (!result.success) {
        // Revert on error
        setQueries((prev) =>
          prev.map((q) => (q.id === queryId ? { ...q, enabled: currentEnabled } : q))
        );
        setErrorMessage(result.error || 'Failed to update search query.');
      }
    });
  };

  const handleDelete = (queryId: string) => {
    const formData = new FormData();
    formData.append('query_id', queryId);

    setQueries((prev) => prev.filter((q) => q.id !== queryId));

    startTransition(async () => {
      await deleteSearchQueryAction(formData);
    });
  };

  return (
    <div className="card" style={{ marginTop: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h2 className="card-title" style={{ fontSize: '1.25rem' }}>
            🔍 JSearch Automated Queries
          </h2>
          <p className="card-desc">
            Automated Google Jobs / RapidAPI queries executed daily at 6 AM IST (max 3 queries/day).
          </p>
        </div>
        <span className="badge badge-blue">RapidAPI JSearch</span>
      </div>

      {errorMessage && (
        <div className="alert alert-error" style={{ marginBottom: '1rem', padding: '0.75rem' }}>
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="alert alert-success" style={{ marginBottom: '1rem', padding: '0.75rem' }}>
          <span>{successMessage}</span>
        </div>
      )}

      {/* Add Query Form */}
      <form onSubmit={handleAddQuery} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <input
          type="text"
          placeholder="e.g. Associate Product Manager in India"
          value={newQueryText}
          onChange={(e) => setNewQueryText(e.target.value)}
          className="input"
          style={{ flex: 2, minWidth: '220px' }}
          required
          disabled={isPending}
        />
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="input"
          style={{ width: '120px' }}
          disabled={isPending}
        >
          <option value="in">India (IN)</option>
        </select>
        <select
          value={datePosted}
          onChange={(e) => setDatePosted(e.target.value)}
          className="input"
          style={{ width: '140px' }}
          disabled={isPending}
        >
          <option value="week">Past Week</option>
          <option value="today">Past 24 Hours</option>
          <option value="month">Past Month</option>
        </select>
        <button
          type="submit"
          disabled={isPending || !newQueryText.trim()}
          className="btn btn-primary"
        >
          {isPending ? 'Adding...' : '+ Add Query'}
        </button>
      </form>

      {/* Query List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {queries.length === 0 ? (
          <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            No automated search queries configured. Add your search queries like &quot;APM Bengaluru&quot; or &quot;Product Manager remote India&quot;.
          </div>
        ) : (
          queries.map((q) => (
            <div
              key={q.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-card-secondary, rgba(255, 255, 255, 0.03))',
                border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  type="checkbox"
                  checked={q.enabled}
                  onChange={() => handleToggle(q.id, q.enabled)}
                  style={{ cursor: 'pointer' }}
                  title="Toggle query enabled/disabled"
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: q.enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    &quot;{q.query}&quot;
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Country: {q.country.toUpperCase()} • Posted: {q.date_posted}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span className={`badge ${q.enabled ? 'badge-emerald' : 'badge-gray'}`}>
                  {q.enabled ? 'Enabled' : 'Paused'}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(q.id)}
                  className="btn btn-secondary"
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: '#f87171', borderColor: 'rgba(248, 113, 113, 0.3)' }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
