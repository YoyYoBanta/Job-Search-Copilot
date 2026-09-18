# Job Search Copilot — Implementation Plan

**Current Status:** Phase 5 Verified & Closed — Ready for Phase 6 / Release

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
- **Status**: [x] Verified on Vercel Preview (All 8 criteria passed)
- **Tasks**:
  - [x] Migration 02 applied in Supabase (verified: `public` schema has `profiles`, `companies`, `jobs`).
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
  - `src/lib/ats/greenhouse.ts`, `src/lib/ats/lever.ts`, `src/lib/ats/ashby.ts`, `src/lib/ats/types.ts`, `src/lib/ats/fetcher.ts`, `src/lib/ats/deduplication.ts`
  - `src/lib/ats/__tests__/deduplication.test.ts`
  - `src/lib/sanitize.ts`
  - `src/lib/__tests__/sanitize.test.ts`
  - `src/app/companies/page.tsx`, `src/app/companies/actions.ts`
  - `src/app/jobs/page.tsx`, `src/app/jobs/paste/page.tsx`, `src/app/jobs/actions.ts`
  - `src/components/CompanyManager.tsx`, `src/components/JobsList.tsx`, `src/components/EligibilityBadge.tsx`, `src/components/ScoreStatusBadge.tsx`
- **"Done When" Test Criteria**:
  1. [x] `npm test` runs and passes all required filter, deduplication, and sanitization unit test scenarios without failures.
  2. [x] Adding a test company (e.g. Greenhouse/Lever/Ashby slug) and clicking "Fetch Jobs" imports only matching Product roles in India/Remote.
  3. [x] Newly fetched or pasted jobs have `score_status = 'pending'` in the database.
  4. [x] Non-product roles and excluded senior titles (e.g. "Director of Product", "Software Engineer") are filtered out.
  5. [x] Duplicate job URLs are not inserted twice.
  6. [x] Dismissing a job and re-fetching confirms the dismissed job is never re-inserted.
  7. [x] HTML formatting is stripped clean from descriptions in the database.
  8. [x] Submitting a manual job via "Paste a Job" stores the job correctly in Supabase.

---

## Phase 3 — AI Matcher: Seniority Context, Anti-Fabrication Bullet Verification, Dynamic Groq Pacing, Single-Job Endpoint, Client Queue & Feedback

- **Goal**: Score candidate-job fit using Groq LLM with a client-driven queue calling a single-job server endpoint (avoiding Vercel serverless execution limits), with dynamic header-based rate-limit pacing, Groq 70B/8B model fallback, verbatim resume bullet validation, and user feedback ratings.
- **Status**: [x] Verified on Vercel Preview (All 8 criteria passed)
- **Tasks**:
  - [x] Create `supabase/migrations/03_scoring.sql` defining:
    - `profiles`: `total_years_experience` (numeric), `pm_years_experience` (numeric), `target_roles` (text[])
    - `jobs`: `scored_model` (text)
    - `feedback`: table with `id`, `user_id`, `job_id`, `rating` ('up' | 'down'), `notes`, timestamps, and RLS scoped to `auth.uid()`.
  - [x] Configure Groq models via `GROQ_MODEL_PRIMARY` (default `openai/gpt-oss-120b`) with automatic fallback to `GROQ_MODEL_FALLBACK` (default `openai/gpt-oss-20b`) on HTTP 404 or daily token caps, using `reasoning_effort: "low"`.
  - [x] Define strict Zod validation schema matching:
    ```typescript
    {
      fit_score: number, // 0-100
      top_reasons: string[], // max 3
      gaps: string[],
      recommended_resume_bullets_to_lead_with: string[],
      seniority_match: "under" | "fit" | "over"
    }
    ```
  - [x] Implement Seniority Context & Evaluation Rules in prompt:
    - "fit": Required PM years/level within reach of candidate's PM/total experience, OR role title in `target_roles` (APM is fit, not under).
    - "over": Role requires clearly more PM years than candidate has (e.g., "8+ years of PM" compared against `pm_years_experience`).
    - "under": Internships or roles below APM.
  - [x] Implement Anti-Fabrication Bullet Checker (`src/lib/matcher/bulletChecker.ts`):
    - Drops recommended resume bullets that do not substantially appear verbatim in the candidate's resume.
  - [x] Implement Single-Job Scoring Route (`/api/score/job`):
    - Authenticates user session and queries via Supabase client with RLS.
    - Handles HTTP 429 by returning `{ retryAfterSeconds }` for browser client pacing (zero serverless function blocking).
    - Retries malformed JSON once with corrective prompt; sets `score_status = 'failed'` on persistent failure.
    - Persists score, match analysis, seniority, and scored model.
  - [x] Build Client-Driven Queue Controller in `src/components/JobsList.tsx`:
    - "⚡ Score All Pending (N)" sequential queue with live progress bar.
    - Paces requests dynamically based on `retryAfterSeconds` on 429.
    - Allows pausing/stopping queue at any time.
  - [x] Add Re-score action on individual job cards (`resetJobScoreAction`).
  - [x] Add Thumbs Up / Thumbs Down feedback buttons (`FeedbackButtons.tsx`) storing ratings in `feedback` table.
  - [x] Add Seniority filter, Score Status filter, and Sort by Fit Score controls to `JobsList`.
  - [x] Add Vitest unit test suites:
    - Seniority rules prompt evaluation (`src/lib/matcher/__tests__/seniority.test.ts`)
    - Anti-fabrication verbatim bullet verification (`src/lib/matcher/__tests__/bulletChecker.test.ts`)
    - Schema validation and JSON extractor (`src/lib/groq/__tests__/schema.test.ts`)
- **Files Touched**:
  - `package.json`
  - `supabase/migrations/03_scoring.sql`, `supabase/migrations/04_score_error.sql`
  - `src/lib/groq/config.ts`, `src/lib/groq/schema.ts`, `src/lib/groq/client.ts`, `src/lib/groq/__tests__/schema.test.ts`
  - `src/lib/matcher/prompts.ts`, `src/lib/matcher/bulletChecker.ts`, `src/lib/matcher/__tests__/seniority.test.ts`, `src/lib/matcher/__tests__/bulletChecker.test.ts`
  - `src/app/api/score/job/route.ts`
  - `src/app/jobs/actions.ts`, `src/app/jobs/page.tsx`
  - `src/app/profile/actions.ts`, `src/app/profile/page.tsx`
  - `src/components/ResumeEditor.tsx`, `src/components/JobsList.tsx`, `src/components/SeniorityBadge.tsx`, `src/components/FeedbackButtons.tsx`, `src/components/ScoreStatusBadge.tsx`
- **"Done When" Test Criteria**:
  1. [x] Triggering batch scoring executes single-job requests sequentially driven by the client UI, displaying progress.
  2. [x] Closing the browser tab and reopening allows resuming scoring from remaining `pending` jobs without duplicates.
  3. [x] Server endpoint execution completes well within Vercel timeout limits since only 1 job is processed per request.
  4. [x] Per-job HTTP 429 responses back off and retry automatically without crashing the client queue.
  5. [x] Successfully scored job displays fit score (0-100), top 3 reasons, gaps, recommended verbatim bullets, model badge, and seniority match badge.
  6. [x] Seniority rules accurately identify APM as "fit", "8+ years PM" as "over", and internships as "under".
  7. [x] Recommended bullets only contain lines verified from candidate resume.
  8. [x] Clicking thumbs up / thumbs down updates user feedback rating in the database.


---

## Phase 4 — Tailor: Cover Note + Referral Message with Copy Buttons

- **Goal**: Generate tailored cover notes (130-170 words) and LinkedIn referral outreach messages (<90 words) on demand per job, with strict grounding, anti-cliché detection, overwrite protections, and one-click copy actions.
- **Status**: [x] Verified on Vercel Preview (All criteria passed)
- **Tasks**:
  - [x] Create Groq prompt templates for tailored assets with style reference and strict rules:
    - **Cover Note**: 130–170 words, hook opener mapped to JD requirements, 2–3 strongest facts, show don't label, shared domain mention, plain closing.
    - **LinkedIn Referral Request**: <90 words, relationship-adjusted CTA (cold = 10-min chat ask), 1 proof point, mandatory full company name + job URL.
  - [x] Implement Server Action / API endpoint to generate outreach assets on demand for a selected job (`/jobs/[id]/tailor/actions.ts`).
  - [x] Store generated copy, last-generated baseline, and outreach model in Supabase `jobs` table (`05_tailored_outreach.sql`).
  - [x] Build "Tailor" UI Drawer / Modal:
    - Display generated Cover Note and Referral Message with editable text areas.
    - 1-click "Copy to Clipboard" button with visual "Copied!" feedback state.
    - Word count indicators and live cliché / gap / ungrounded warnings.
    - Overwrite confirmation alert if user edited text before regenerating.
    - Model source badge showing which model generated the copy.
  - [x] Anti-fabrication grounding check for company and product entities against resume + JD corpus.
- **Files Touched**:
  - `src/lib/tailor/prompts.ts`, `src/lib/tailor/generator.ts`, `src/lib/tailor/validator.ts`, `src/lib/tailor/schema.ts`
  - `src/lib/tailor/__tests__/prompts.test.ts`, `src/lib/tailor/__tests__/validator.test.ts`
  - `src/components/TailorDrawer.tsx`, `src/components/JobsList.tsx`
  - `src/app/jobs/actions.ts`, `supabase/migrations/05_tailored_outreach.sql`
- **"Done When" Test Criteria**:
  1. [x] Clicking "✍️ Draft Outreach" on a scored fit job opens drawer and generates grounded cover note and referral message.
  2. [x] Tone is direct, factual, and strictly truthful to resume + JD, with no corporate clichés or gap apologies.
  3. [x] Entity grounding check verifies companies/tools appear in resume or JD.
  4. [x] 1-click Copy buttons copy text cleanly to clipboard.
  5. [x] Editing text and clicking regenerate prompts for confirmation before overwriting edits.
  6. [x] All Vitest tests pass (82 tests across 8 suites) and Vercel production deployment is verified green.

---

## Phase 5 — Tracker Board with Status History, Notes, and Pipeline Metrics

- **Goal**: Provide an interactive status-dropdown pipeline tracker across all application stages, logging timestamped status transitions, notes, follow-up nudges in Asia/Kolkata (IST), and calculating historical conversion metrics.
- **Status**: [x] Verified on Vercel Preview (All criteria passed)
- **Tasks**:
  - [x] Create `supabase/migrations/06_applications.sql` defining `applications` table with `stage_history` JSONB, user notes, `BEFORE UPDATE` handle_updated_at trigger, composite indexes `(user_id, stage)` and `(user_id, next_follow_up_date)`, and RLS scoped to `auth.uid()` with `jobs` ownership checks.
  - [x] Implement timezone utilities in `src/lib/tracker/dates.ts` strictly using Asia/Kolkata (IST, UTC+5:30) for today, 7 days ago/ahead, follow-up due, and applications this week.
  - [x] Implement metrics calculation in `src/lib/tracker/metrics.ts` based on `stage_history`:
    - Response rate = applications that ever reached `interviewing` or `offer` / applications that ever reached `applied`.
    - Referral conversion rate = applications that ever reached `referral_asked` and subsequently reached `applied` or beyond / applications that ever reached `referral_asked`.
  - [x] Build responsive Application Tracker UI (`src/app/tracker/page.tsx` & `src/components/TrackerBoard.tsx`):
    - Stage pill tabs (`All`, `🔔 Action Due`, `Saved`, `Referral Asked`, `Applied`, `Interviewing`, `Offer`, `Closed`).
    - Top metrics cards: Active Pipeline, Applied This Week, Response Rate %, Referral Conversion %.
    - Follow-up Nudges banner with quick `+7d Snooze`.
    - Stage dropdown selector logging timestamped events to `stage_history`.
    - Referral contact modal prompt when moving to `Referral Asked`.
    - Inline editable metadata (Channel, Referrer Name, Applied Date IST, Next Follow-Up Date IST).
    - Expandable Notes textarea with manual Save button.
    - Integrated Outreach Drawer trigger ("✍️ Cover Note & Referral").
  - [x] Connect Jobs Feed with Tracker:
    - `"📌 Track"` button on untracked job cards.
    - Stage badge on tracked jobs linking directly to `/tracker`.
  - [x] Comprehensive Vitest test suite for dates (`dates.test.ts`) and historical conversion metrics (`metrics.test.ts`).
- **Files Touched**:
  - `supabase/migrations/06_applications.sql`
  - `src/lib/tracker/dates.ts`, `src/lib/tracker/metrics.ts`
  - `src/lib/tracker/__tests__/dates.test.ts`, `src/lib/tracker/__tests__/metrics.test.ts`
  - `src/app/tracker/page.tsx`, `src/app/tracker/actions.ts`
  - `src/components/TrackerBoard.tsx`, `src/components/JobsList.tsx`, `src/components/Navbar.tsx`
- **"Done When" Test Criteria**:
  1. [x] Jobs can be tracked from `/jobs` with one click and appear on `/tracker`.
  2. [x] Stage transitions immediately update UI and append timestamped entry to `stage_history`.
  3. [x] When moving to `applied` or `referral_asked`, `next_follow_up_date` defaults to today + 7 days (IST) if empty.
  4. [x] Follow-up nudges flag active applications due for action using Asia/Kolkata timezone boundary.
  5. [x] Response rate and referral conversion calculate correctly from `stage_history` (e.g. `applied -> interviewing -> rejected` counts as response).
  6. [x] Application notes, channel, referrer name, and follow-up dates persist cleanly.
  7. [x] All 10 Vitest test suites (90 tests) pass.

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
