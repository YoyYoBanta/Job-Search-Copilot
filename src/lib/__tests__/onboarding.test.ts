import { describe, it, expect, vi } from 'vitest';
import { areIncludeTitlesDefault, ensureUserOnboarded } from '../onboarding';
import { DEFAULT_INCLUDE_TITLES } from '@/config/filters';

describe('Onboarding Helper Tests', () => {
  describe('areIncludeTitlesDefault', () => {
    it('returns true for exact default include titles', () => {
      expect(areIncludeTitlesDefault([...DEFAULT_INCLUDE_TITLES])).toBe(true);
    });

    it('returns true regardless of casing or array order', () => {
      const reversed = [...DEFAULT_INCLUDE_TITLES].reverse();
      expect(areIncludeTitlesDefault(reversed)).toBe(true);
    });

    it('returns false if custom titles were added or removed', () => {
      expect(areIncludeTitlesDefault(['Product Manager'])).toBe(false);
      expect(areIncludeTitlesDefault([...DEFAULT_INCLUDE_TITLES, 'CTO'])).toBe(false);
      expect(areIncludeTitlesDefault([])).toBe(false);
      expect(areIncludeTitlesDefault(null)).toBe(false);
    });
  });

  describe('ensureUserOnboarded', () => {
    it('creates profile, default filters, and default search queries for a brand new user', async () => {
      const tables: Record<string, any[]> = {
        profiles: [],
        user_filters: [],
        search_queries: [],
      };

      const mockSupabase: any = {
        from: (tableName: string) => {
          return {
            select: (cols: string, opts?: any) => {
              return {
                eq: (field: string, val: any) => {
                  return {
                    maybeSingle: async () => {
                      const found = tables[tableName]?.find((r) => r[field] === val);
                      return { data: found || null, error: null };
                    },
                    then: (resolve: any) => {
                      if (opts?.count === 'exact') {
                        const count = tables[tableName]?.filter((r) => r[field] === val).length;
                        resolve({ count, data: null, error: null });
                      } else {
                        const filtered = tables[tableName]?.filter((r) => r[field] === val);
                        resolve({ data: filtered, error: null });
                      }
                    },
                  };
                },
              };
            },
            insert: async (rows: any | any[]) => {
              const rowArray = Array.isArray(rows) ? rows : [rows];
              tables[tableName] = [...(tables[tableName] || []), ...rowArray];
              return { error: null };
            },
          };
        },
      };

      const result = await ensureUserOnboarded(mockSupabase, 'user-123', 'amber@example.com', 'Amber');

      expect(result.profileCreated).toBe(true);
      expect(result.filtersCreated).toBe(true);
      expect(result.queriesCreated).toBe(true);
      expect(tables.profiles.length).toBe(1);
      expect(tables.user_filters.length).toBe(1);
      expect(tables.search_queries.length).toBe(3);
    });
  });
});
