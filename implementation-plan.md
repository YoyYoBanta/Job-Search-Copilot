# Job Search Copilot — Implementation Plan

**Current Status:** Phase 2 — Code Complete (Awaiting Vercel Preview Verification)

---

## Phase 1 — Setup, Supabase Schema (Profiles) with RLS, Email+Password Auth Restricted to ALLOWED_EMAIL, My Profile

- **Goal**: Initialize the Next.js project, configure Supabase Email+Password Auth with single-user whitelist (`ALLOWED_EMAIL`), create `profiles` table with RLS, and build the "My Profile" resume management feature.
- **Status**: [x] Verified on Vercel Preview (All 6 criteria passed)
- **Tasks**:
  - [x] Initialize Next.js project with App Router, TypeScript, and modern styling.
  - [x] Create `.env.example` and `.env.local` template with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, and `ALLOWED_EMAIL`.
  - [x] Create `supabase/migrations/01_profiles.sql` defining only the `profiles` table (`id`, `user_id`, `resume_text`, `updated_at`) with Row Level Security (RLS) policies strictly scoped to `auth.uid()`.
  - [x] Implement Supabase client/server helper utilities:
    - Client component helper: `src/lib/supabase/client.ts`
    - Server component / action helper: `src/lib/supabase/server.ts`
    - *(Note: Only create `src/lib/supabase/admin.ts` if a feature genuinely requires bypassing RLS; if created, enforce `import 'server-only'` at the top. Prefer standard server client with RLS everywhere).*
  - [x] Implement Authentication flow:
    - Login page with Supabase Auth using **Email + Password** (avoiding free-tier magic link email limits).
    - Next.js middleware and server-level auth checks enforcing `user.email === process.env.ALLOWED_EMAIL`.
    - Sign out and redirect unauthorized users to an "Access Denied / Not Authorised" screen.
  - [x] Build "My Profile" page:
    - Textarea to paste and edit raw resume text.
    - Save action storing resume text in `profiles` table.
    - Reload/fetch existing resume on page load.
  - [x] Document in setup checklist: Disable "Allow new users to sign up" in Supabase Auth Settings after creating the primary account.
  - [x] Build global navigation and layout shell.
- **Files Likely Touched**:
  - `package.json`, `tsconfig.json`, `next.config.mjs`
  - `.env.example`, `.env.local`
  - `supabase/migrations/01_profiles.sql`
  - `src/middleware.ts`
  - `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`
  - `src/lib/auth.ts`
  - `src/app/layout.tsx`, `src/app/globals.css`
  - `src/app/login/page.tsx`, `src/app/unauthorized/page.tsx`
  - `src/app/profile/page.tsx`, `src/app/profile/actions.ts`
- **"Done When" Test Criteria**:
  1. [x] **Unauthenticated Redirection**: Visiting `/profile` or `/` in an unauthenticated / incognito session redirects to `/login`.
  2. [x] **Authorized Login**: Logging in with email + password matching `ALLOWED_EMAIL` grants access to `/profile` and dashboard.
  3. [x] **Unauthorized User Block (Throwaway Account Test)**: Create a temporary second user via Supabase Dashboard → Authentication → Add User (with an email different from `ALLOWED_EMAIL`). Attempting to log in with this account immediately signs them out automatically on the server and displays the "Not Authorised" page. After landing on Not Authorised, visit `/profile` — it must redirect to `/login`. (Delete the throwaway user from Supabase after verification).
  4. [x] **Resume Persistence & Reload**: User can paste resume text into `/profile`, click "Save Resume Profile", hard-reload the page, and see the saved resume persisted from Supabase `profiles` table.
  5. [x] **SQL-Editor RLS Check**: In Supabase SQL Editor, run:
     ```sql
     begin;
     set local role anon;
     select count(*) as visible_to_logged_out from public.profiles;
     set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
     set local role authenticated;
     select count(*) as visible_to_other_user from public.profiles;
     rollback;
     ```
     Expected result: both counts are 0.
  6. [x] **Signup Disabled**: "Allow new users to sign up" is verified disabled in Supabase dashboard settings after the owner account is created.

---

## Phase 2 — Companies List, Job Ingestion (Greenhouse/Lever/Ashby), Filtering & Unit Tests, Deduplication, HTML Stripping, Paste a Job Form

- **Goal**: Ingest public ATS job board feeds and manual submissions, sanitize descriptions, and strictly filter by role and location using a centralized configuration file with comprehensive unit tests.
- **Tasks**:
  - [x] Create `supabase/migrations/02_companies_and_jobs.sql` defining `companies` and `jobs` tables with idempotent RLS policies scoped to `auth.uid()`, foreign company ownership checks, and performance indexes. The `jobs` table schema must include:
    - `dismissed`: `boolean` (default `false`)
    - `score_status`: `text` (default `'pending'`, constrained to `'pending' | 'scored' | 'failed'`)
    - `fit_score`: `integer` (nullable)
    - `match_analysis`: `jsonb` (nullable)
    - `scored_at`: `timestamptz` (nullable)
  - [x] Create centralized filter config in `src/config/filters.ts` with:
    - Whole-word regex matching for location and title tokens.
    - Case-sensitive uppercase `IN` token matcher (`\bIN\b`) vs case-insensitive other tokens.
    - Product role inclusion list (`Product Manager`, `APM`, `Associate Product`, `Product Owner`, `Product Analyst`).
    - Seniority exclusion list (`Director`, `Head of`, `VP`, `Principal`, `Group Product`, `Staff`).
    - Remote eligibility logic: India/APAC paired OR standalone country-less Remote (with `"Check eligibility"` badge flag), rejecting other regions (`US`, `EU`, etc.).
  - [x] Implement unit test suite (Vitest) for `src/config/filters.ts` and `src/lib/ats/fetcher.ts` testing all mandated cases:
    - `"Bengaluru, IN"` (PASS)
    - `"Singapore"` (FAIL)
    - `"Hybrid in London"` (FAIL)
    - `"Remote - US"` (FAIL)
    - `"Remote"` (PASS + `"Check eligibility"` badge)
    - `"Hybrid - Gurugram"` (PASS)
    - `"Director of Product"` (FAIL)
    - `"Associate Product Manager"` (PASS)
    - Dismissed / existing job URLs are skipped on re-fetch and never re-inserted.
  - [x] Build HTML sanitization helper to strip tags and extra whitespace from job descriptions before DB storage.
  - [x] Build ATS Feed fetchers (`src/lib/ats/greenhouse.ts`, `lever.ts`, `ashby.ts`):
    - Greenhouse: `https://boards-api.greenhouse.io/v1/boards/{company}/jobs?content=true`
    - Lever: `https://api.lever.co/v0/postings/{company}?mode=json`
    - Ashby: `https://api.ashbyhq.com/posting-api/job-board/{company}`
  - [x] Implement URL deduplication logic before inserting new jobs into Supabase (treating dismissed rows as existing).
  - [x] Build "Companies" management UI:
    - Add, edit, delete company slugs and board types (`greenhouse` | `lever` | `ashby`).
    - "Fetch Jobs" trigger button executing ingestion and filtering pipeline.
  - [x] Build "Paste a Job" manual submission form (Title, Company, Location, Job URL, Job Description) running through the same sanitizer and filters.
- **Files Likely Touched**:
  - `supabase/migrations/02_companies_and_jobs.sql`
  - `src/config/filters.ts`
  - `src/config/__tests__/filters.test.ts`
  - `src/lib/ats/greenhouse.ts`, `src/lib/ats/lever.ts`, `src/lib/ats/ashby.ts`, `src/lib/ats/types.ts`, `src/lib/ats/fetcher.ts`
  - `src/lib/ats/__tests__/deduplication.test.ts`
  - `src/lib/sanitize.ts`
  - `src/app/companies/page.tsx`, `src/app/companies/actions.ts`
  - `src/app/jobs/page.tsx`, `src/app/jobs/paste/page.tsx`, `src/app/jobs/actions.ts`
  - `src/components/CompanyManager.tsx`, `src/components/JobsList.tsx`, `src/components/EligibilityBadge.tsx`, `src/components/ScoreStatusBadge.tsx`
- **"Done When" Test Criteria**:
  1. `npm test` runs and passes all 11+ required filter and deduplication unit test scenarios without failures.
  2. Adding a test company (e.g. Greenhouse/Lever/Ashby slug) and clicking "Fetch Jobs" imports only matching Product roles in India/Remote.
  3. Newly fetched or pasted jobs have `score_status = 'pending'` in the database.
  4. Non-product roles and excluded senior titles (e.g. "Director of Product", "Software Engineer") are filtered out.
  5. Duplicate job URLs are not inserted twice.
  6. Dismissing a job and re-fetching confirms the dismissed job is never re-inserted.
  7. HTML formatting is stripped clean from descriptions in the database.
  8. Submitting a manual job via "Paste a Job" stores the job correctly in Supabase.

---

## Phase 3 — AI Matcher: Single-Job Scoring Endpoint, Client-Driven Queue, 429 Backoff, JSON Schema Validation & Retry, Thumbs Up/Down

- **Goal**: Score candidate-job fit using Groq LLM with a client-driven queue calling a single-job server endpoint (avoiding Vercel serverless execution limits), with per-job 429 backoff, strict JSON validation, and feedback thumbs.
- **Tasks**:
  - [ ] Create `supabase/migrations/03_feedback.sql` for scoring feedback ratings with RLS scoped to `auth.uid()`.
  - [ ] Confirm exact Groq model ID from Groq documentation (e.g., `openai/gpt-oss-120b` or active Groq model) and define constant in `src/lib/groq.ts`.
  - [ ] Define strict Zod validation schema matching:
    ```typescript
    {
      fit_score: number, // 0-100
      top_reasons: string[], // max 3
      gaps: string[],
      recommended_resume_bullets_to_lead_with: string[],
      seniority_match: "under" | "fit" | "over"
    }
    ```
  - [ ] Implement system prompt strictly enforcing truthfulness (no hallucinations / only facts from user resume).
  - [ ] Implement Single-Job Server Action / API Route (`/api/score/job`):
    - Receives a single `jobId`.
    - Evaluates fit against the stored resume.
    - Handles Groq HTTP 429 rate limit with per-job exponential backoff.
    - Retries once on malformed JSON; sets `score_status = 'scoring failed'` if second attempt fails.
    - Saves match result (`fit_score`, `match_analysis`, `score_status`, `scored_at`) to Supabase.
  - [ ] Build Client-Driven Queue Controller in UI:
    - Fetches list of jobs where `score_status = 'pending'`.
    - Iterates sequentially on the client side: requests scoring for one job, waits the configured pacing delay, and requests the next.
    - Displays live progress indicator (e.g., "Scoring 7 of 30").
    - If user closes or refreshes the tab, scoring pauses cleanly and resumes from remaining `'pending'` jobs upon reopening.
  - [ ] Add "Re-score" button on individual job cards to reset status to `'pending'` and re-trigger single-job scoring.
  - [ ] Add Thumbs Up / Thumbs Down interactive feedback buttons on each scored job card and store rating in `feedback` table.
- **Files Likely Touched**:
  - `supabase/migrations/03_feedback.sql`
  - `src/lib/groq.ts`
  - `src/lib/matcher/schema.ts`, `src/lib/matcher/prompts.ts`
  - `src/app/api/score/job/route.ts` or `src/app/jobs/score-actions.ts`
  - `src/hooks/useScoreQueue.ts` or `src/components/ScoreQueueManager.tsx`
  - `src/components/ScoreDisplay.tsx`, `src/components/FeedbackButtons.tsx`, `src/components/JobScoreCard.tsx`
- **"Done When" Test Criteria**:
  1. Triggering batch scoring executes single-job requests sequentially driven by the client UI, displaying progress (e.g. "Scoring 7 of 30").
  2. Closing the browser tab and reopening allows resuming scoring from remaining `pending` jobs without duplicates.
  3. Server endpoint execution completes well within Vercel timeout limits since only 1 job is processed per request.
  4. Per-job HTTP 429 responses back off and retry automatically without crashing the client queue.
  5. Successfully scored job displays fit score (0-100), top 3 reasons, gaps, recommended bullets, and seniority match badge.
  6. Jobs failing validation twice display `"scoring failed"` state with an active "Re-score" button.
  7. Clicking thumbs up / thumbs down updates the user feedback rating in the database.

---

## Phase 4 — Tailor: Cover Note + Referral Message with Copy Buttons

- **Goal**: Generate tailored 120-word cover notes and 60-word LinkedIn referral outreach messages on demand per job, with one-click copy actions.
- **Tasks**:
  - [ ] Create Groq prompt templates for tailored assets:
    - **Cover Note**: ~120 words, plain and non-salesy tone, strictly truthful to resume facts.
    - **LinkedIn Referral Request**: ~60 words, concise, professional, authentic outreach copy.
  - [ ] Implement Server Action / API route to generate outreach assets on demand for a selected job.
  - [ ] Store generated copy in Supabase associated with the job record.
  - [ ] Build "Tailor" UI modal / drawer:
    - Display generated Cover Note and Referral Message.
    - 1-click "Copy to Clipboard" button with visual "Copied!" feedback state for each.
    - Editable text area in case user wants to tweak before copying.
- **Files Likely Touched**:
  - `src/lib/tailor/prompts.ts`, `src/lib/tailor/generator.ts`
  - `src/components/TailorModal.tsx`, `src/components/CopyButton.tsx`
  - `src/app/jobs/[id]/tailor/actions.ts`
- **"Done When" Test Criteria**:
  1. Clicking "Tailor" on a job calls Groq and generates both a ~120-word cover note and a ~60-word referral message.
  2. Tone is plain and non-salesy, referencing only experiences present in the user's profile.
  3. Clicking "Copy" on either card copies the exact text to clipboard and shows visual confirmation.
  4. Generated notes persist so viewing the job again doesn't require regenerating unless requested.

---

## Phase 5 — Tracker Board with Status History, Notes, and Pipeline Metrics

- **Goal**: Provide an interactive status-dropdown pipeline tracker across all application stages, logging timestamped status transitions, notes, and calculating pipeline performance metrics (with drag-and-drop as optional polish).
- **Tasks**:
  - [ ] Create `supabase/migrations/04_applications.sql` defining `applications` table with `status_history` JSONB, user notes, and RLS scoped to `auth.uid()`.
    - Migration must backfill one row with status `'Found'` for every existing job that has no application row.
    - Configure database trigger / action logic to automatically create an application row with status `'Found'` whenever a new job is inserted.
  - [ ] Build Kanban board UI with stage columns:
    `Found` | `Shortlisted` | `Referral asked` | `Applied` | `Interview` | `Rejected` | `Offer`
  - [ ] Implement **status dropdown selector** on each job/application card to transition stages and log timestamped events into `status_history`.
  - [ ] (Optional Polish): Add drag-and-drop column movement once dropdown logic is solid.
  - [ ] Implement per-job user notes field with auto-save / save action.
  - [ ] Build Top-Level Metrics Header:
    - Jobs found this week
    - % Shortlisted (`Shortlisted / Total Found`)
    - Applications sent
    - Referral requests sent
    - Interview rate (`Interviews / Applications`)
    - Score sanity agreement % (from thumbs up vs down)
  - [ ] Add filtering/sorting on tracker board (by fit score, date, company).
- **Files Likely Touched**:
  - `supabase/migrations/04_applications.sql`
  - `src/app/tracker/page.tsx`, `src/app/tracker/actions.ts`
  - `src/components/TrackerBoard.tsx`, `src/components/KanbanColumn.tsx`, `src/components/JobTrackerCard.tsx`
  - `src/components/StatusDropdown.tsx`, `src/components/MetricsHeader.tsx`, `src/components/NotesEditor.tsx`
  - `src/lib/metrics.ts`
- **"Done When" Test Criteria**:
  1. All jobs from earlier phases automatically appear on the board in the 'Found' column (via migration backfill), and newly created jobs automatically create an application row.
  2. Changing a job's status via dropdown updates its column immediately and appends a timestamped entry to `status_history`.
  3. Adding/editing a note on a job persists across page reloads.
  4. Metrics bar accurately displays: jobs found this week, % shortlisted, applications count, referral requests count, and interview rate %.
  5. Pipeline reflects live state across all active applications.

---

## Phase 6 — README, Vercel Deployment Checklist, Final Security Review

- **Goal**: Package comprehensive setup documentation, verify Vercel deployment readiness, and perform end-to-end security and secrets isolation audits.
- **Tasks**:
  - [ ] Complete `README.md` with step-by-step instructions:
    - Prerequisites (Node.js, Supabase account, Groq API key).
    - Database setup (running Supabase migrations in order `01` to `04`).
    - Supabase Auth setup (Email+Password provider and disabling signups after owner registration).
    - Environment variables setup (`.env.example`).
    - Local dev commands (`npm run dev`, `npm test`).
    - Vercel deployment guide.
  - [ ] Security & secrets audit:
    - Ensure `SUPABASE_SERVICE_ROLE_KEY` and `GROQ_API_KEY` are never bundled into client JS or exposed with `NEXT_PUBLIC_`.
    - Ensure `src/lib/supabase/admin.ts` (if present) has `import 'server-only'`.
    - Ensure all API routes / Server Actions enforce user session + `ALLOWED_EMAIL` verification.
    - Ensure RLS policies are enabled on all Supabase tables.
  - [ ] Verify production build (`npm run build`) runs cleanly without errors.
  - [ ] Final end-to-end manual verification walkthrough.
- **Files Likely Touched**:
  - `README.md`
  - `.env.example`
  - `src/` (security audit across all endpoints)
- **"Done When" Test Criteria**:
  1. `npm run build` succeeds with zero TypeScript or bundling errors.
  2. `README.md` allows a fresh developer to set up and run the app from scratch.
  3. Client bundle contains no references to `GROQ_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY`.
  4. Accessing any backend action unauthenticated or with an unauthorized email returns HTTP 401/403.
