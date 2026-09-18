# Job Search Copilot — System Architecture (Phase 2)

This document reflects the actual implemented architecture, directory structure, data models, and access control flows as of **Phase 2**.

---

## 1. Directory Structure

```
Job AI/
├── .github/
│   └── workflows/
│       └── ci.yml                   # Automated CI workflow (typecheck, vitest unit tests, build)
├── .env.example                     # Environment template with required keys
├── .gitignore                       # Node, Next.js, and secret ignore rules
├── package.json                     # Next.js 15, React 19, Supabase SSR, Vitest dependencies
├── tsconfig.json                    # TypeScript compiler configuration & path aliases (@/*)
├── next.config.mjs                  # Next.js runtime configuration
├── context.md                       # Canonical requirements & specifications
├── implementation-plan.md           # Master phased delivery plan & checklist
├── architecture.md                  # This architecture document
├── supabase/
│   └── migrations/
│       ├── 01_profiles.sql          # Phase 1 profiles table & RLS policies
│       └── 02_companies_and_jobs.sql # Phase 2 companies and jobs tables & RLS policies
└── src/
    ├── middleware.ts                # Session refresh & ALLOWED_EMAIL edge protection
    ├── config/
    │   ├── filters.ts               # Whole-word regex filters, token matchers, India/Remote rules
    │   └── __tests__/
    │       └── filters.test.ts      # Comprehensive Vitest unit tests for filters
    ├── lib/
    │   ├── auth.ts                  # Server-side auth & whitelist verification helpers
    │   ├── sanitize.ts              # HTML tag stripping, script/style cleanup, entity decoding
    │   ├── ats/
    │   │   ├── types.ts             # ATS data types & interfaces
    │   │   ├── greenhouse.ts        # Greenhouse boards API client
    │   │   ├── lever.ts             # Lever postings API client
    │   │   ├── ashby.ts             # Ashby job board API client
    │   │   └── fetcher.ts           # Unified fetch, filter, deduplicate & insert pipeline
    │   └── supabase/
    │       ├── client.ts            # Browser client helper (@supabase/ssr)
    │       └── server.ts            # Async server client helper (@supabase/ssr + cookies)
    ├── components/
    │   ├── Navbar.tsx               # Global navigation with Jobs, Companies, Paste Job links
    │   ├── LocalTime.tsx            # Client browser timezone formatter component
    │   ├── ResumeEditor.tsx         # Client resume text editor with live metrics & alert states
    │   ├── CompanyManager.tsx       # Target company CRUD & ATS fetch controls
    │   ├── JobsList.tsx             # Interactive job search, description viewer & score badges
    │   ├── EligibilityBadge.tsx     # "Check eligibility" badge for general remote roles
    │   └── ScoreStatusBadge.tsx     # Pending / Scored / Failed badge component
    └── app/
        ├── globals.css              # Vanilla CSS dark design system & tokens
        ├── layout.tsx               # Root layout wrapper with Navbar and main container
        ├── page.tsx                 # Protected home dashboard with live statistics
        ├── login/
        │   ├── page.tsx             # Email + Password login interface
        │   └── actions.ts           # Server action for authentication & whitelist enforcement
        ├── unauthorized/
        │   └── page.tsx             # Access denied screen with sign-out trigger
        ├── profile/
        │   ├── page.tsx             # Server page loading resume data
        │   └── actions.ts           # Server action for saving resume to Supabase
        ├── companies/
        │   ├── page.tsx             # Target companies board management page
        │   └── actions.ts           # Server actions for add/delete/fetch companies
        └── jobs/
            ├── page.tsx             # Ingested jobs browser page
            ├── actions.ts           # Server actions for manual job paste & deletion
            └── paste/
                └── page.tsx         # Manual job description paste & live filter preview
```

---

## 2. Implemented Database Schema (Phase 1 & 2)

### `public.profiles` (Phase 1)
Stores the single authorized user's master resume text.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique profile record identifier |
| `user_id` | `UUID` | `NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE` | Scoped Supabase Auth user ID |
| `resume_text` | `TEXT` | `NOT NULL DEFAULT ''` | Plain text / markdown resume payload |
| `created_at` | `TIMESTAMPTZ`| `NOT NULL DEFAULT now()` | Initial creation timestamp |
| `updated_at` | `TIMESTAMPTZ`| `NOT NULL DEFAULT now()` | Auto-updated on record changes |

### `public.companies` (Phase 2)
Stores target company ATS feeds configured by the user.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique company identifier |
| `user_id` | `UUID` | `NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` | Scoped Supabase Auth user ID |
| `name` | `TEXT` | `NOT NULL` | Display name (e.g. "Stripe") |
| `slug` | `TEXT` | `NOT NULL` | ATS board slug / identifier |
| `board_type` | `TEXT` | `NOT NULL CHECK (board_type IN ('greenhouse', 'lever', 'ashby'))` | ATS feed platform |
| `created_at` | `TIMESTAMPTZ`| `NOT NULL DEFAULT now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ`| `NOT NULL DEFAULT now()` | Auto-updated on record changes |

*Unique constraint*: `UNIQUE (user_id, slug, board_type)`.

### `public.jobs` (Phase 2)
Stores filtered job postings imported from ATS feeds or manually pasted.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique job posting identifier |
| `user_id` | `UUID` | `NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` | Scoped Supabase Auth user ID |
| `company_id` | `UUID` | `REFERENCES public.companies(id) ON DELETE SET NULL` | Linked company ID (nullable) |
| `title` | `TEXT` | `NOT NULL` | Job role title |
| `company_name` | `TEXT` | `NOT NULL` | Company display name |
| `location` | `TEXT` | `NOT NULL` | Location string from posting |
| `job_url` | `TEXT` | `NOT NULL` | Original job posting URL |
| `description` | `TEXT` | `NOT NULL` | Sanitized HTML-stripped description |
| `source` | `TEXT` | `NOT NULL DEFAULT 'feed' CHECK (source IN ('feed', 'manual'))` | Origin source |
| `needs_eligibility_check` | `BOOLEAN` | `NOT NULL DEFAULT false` | True for country-less general remote roles |
| `dismissed` | `BOOLEAN` | `NOT NULL DEFAULT false` | Soft-deleted / dismissed job state |
| `score_status` | `TEXT` | `NOT NULL DEFAULT 'pending' CHECK (score_status IN ('pending', 'scored', 'failed'))` | AI scoring state |
| `fit_score` | `INTEGER` | `NULL` | Fit score (0-100) from Phase 3 |
| `match_analysis` | `JSONB` | `NULL` | Top reasons, gaps, bullets from Phase 3 |
| `seniority_match` | `TEXT` | `NULL CHECK (seniority_match IN ('under', 'fit', 'over'))` | Seniority classification |
| `scored_at` | `TIMESTAMPTZ` | `NULL` | Timestamp of scoring completion |
| `created_at` | `TIMESTAMPTZ`| `NOT NULL DEFAULT now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ`| `NOT NULL DEFAULT now()` | Auto-updated on record changes |

*Unique constraint*: `UNIQUE (user_id, job_url)`.
*Indexes*: `jobs(user_id, created_at DESC)`, `jobs(company_id)`, `companies(user_id)`.

### Row Level Security (RLS) Policies
- All tables (`profiles`, `companies`, `jobs`) have RLS enabled with idempotent policies strictly scoped to `auth.uid() = user_id` across `SELECT`, `INSERT`, `UPDATE`, and `DELETE`.
- `jobs` INSERT/UPDATE policies enforce that `company_id`, when non-null, references a company owned by the same authenticated user.
- Triggers on `companies` and `jobs` invoke `public.handle_updated_at()` before update.

---

## 3. Job Ingestion & Filtering Pipeline (Phase 2)

```
+-----------------------------------------------------------------------------------+
| ATS Feeds (Greenhouse, Lever, Ashby) / Manual "Paste a Job" Form                  |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 1. Filter Evaluation (`src/config/filters.ts`)                                    |
|    - Title: Includes Product roles, Excludes Senior roles (Director, VP, Staff)   |
|    - Location: Whole-word match on India cities, uppercase \bIN\b, or Remote      |
|    - Excluded foreign remote (US, EU, UK, etc.) rejected                          |
|    - Country-less Remote tagged with needs_eligibility_check = true                |
+-----------------------------------------------------------------------------------+
                                         | (Passed filter only)
                                         v
+-----------------------------------------------------------------------------------+
| 2. HTML Sanitization (`src/lib/sanitize.ts`)                                      |
|    - Strips <script>, <style>, tags, comments, decodes HTML entities              |
|    - Normalizes spacing and line breaks                                           |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 3. URL Deduplication & Insertion                                                  |
|    - Checks `jobs` for existing `job_url` under current `user_id`                 |
|    - Inserts new postings with `score_status = 'pending'`                         |
+-----------------------------------------------------------------------------------+
```

