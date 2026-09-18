# Job Search Copilot — Project Context & Specification

## 1. Overview & Tech Stack

A personal, single-user **"Job Search Copilot"** web application designed to streamline job tracking, automated job feed ingestion from public ATS boards, AI-powered match analysis, and outreach generation.

- **Framework**: Next.js (App Router)
- **Database & Auth / Storage**: Supabase
- **AI / LLM**: Groq API (`gpt-oss-120b` or specified Groq model)
- **Deployment**: Vercel-ready
- **Target Audience**: Single-user personal use

---

## 2. Non-Negotiable Hard Rules

- **No Scraping / Automated Logins**: NEVER log in to, scrape, or automate LinkedIn, Naukri, or any website requiring authentication.
- **No Auto-Submissions**: No automated job applications and no automated messaging. Every application and outreach message must be sent manually by the user.
- **Strict Data Truthfulness**: The AI must never hallucinate or invent experience or skills not present in the user's resume.

---

## 3. Job Sources & ATS Ingestion

Jobs are fetched exclusively from public, official ATS job board feeds plus manual user input:

### Supported Public Feeds
1. **Greenhouse**:  
   `https://boards-api.greenhouse.io/v1/boards/{company}/jobs?content=true`
2. **Lever**:  
   `https://api.lever.co/v0/postings/{company}?mode=json`
3. **Ashby**:  
   `https://api.ashbyhq.com/posting-api/job-board/{company}`

### Manual Ingestion
- **"Paste a Job" Form**: Allows pasting any job description manually (title, company, description, URL, location).

---

## 4. Core Features (v1)

### 1. Companies List & Job Ingestion
- Maintain a list of target companies with their slug and board type (`greenhouse` | `lever` | `ashby`).
- **"Fetch jobs" Action**:
  - Pulls openings from configured company boards.
  - **Role Filter**: Retains only product roles (job title contains `Product Manager`, `APM`, `Associate Product`, `Product Owner`, `Product Analyst`).
  - **Location Filter**: India or Remote.
  - **Deduplication**: Deduplicates openings by job URL.

### 2. My Profile & Resume Storage
- Profile page allowing the user to paste and update raw resume text once.
- Stored persistently in Supabase.

### 3. AI Matcher (Groq LLM)
- For each new or selected job, calls the Groq API comparing the user resume against the job description.
- **Strict JSON Output Schema**:
  ```json
  {
    "fit_score": 85,
    "top_reasons": ["Reason 1", "Reason 2", "Reason 3"],
    "gaps": ["Gap 1", "Gap 2"],
    "recommended_resume_bullets_to_lead_with": ["Bullet 1", "Bullet 2"],
    "seniority_match": "under" | "fit" | "over"
  }
  ```
- **Validation & Retry**: Validate JSON structure; retry once on failure. If validation fails again, mark job as `"scoring failed"`.
- **Constraint**: Must strictly reference facts from the user's profile.

### 4. Tailor (On-Demand Content Generator)
- Per-job button generating:
  - **Cover Note**: ~120 words, plain and non-salesy tone, factual based only on resume.
  - **LinkedIn Referral Request**: ~60 words, direct and authentic outreach copy.
- UI includes 1-click **Copy to Clipboard** buttons for each generated asset.

### 5. Application & Pipeline Tracker
- **Kanban / Status Pipeline**:
  - `Found`
  - `Shortlisted`
  - `Referral asked`
  - `Applied`
  - `Interview`
  - `Rejected`
  - `Offer`
- **Metadata**: Tracks timestamps/dates for each status transition and stores user notes.
- **Analytics & Summary Counters**: Top-level summary counts (e.g., *Applied this week*, *Interview rate*).

---

## 5. Configuration & Environment Variables

Store all sensitive secrets and configuration in `.env.local` and maintain a documented `.env.example`:

- `GROQ_API_KEY`: Groq API authentication key (server-only)
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (server-only)
- `ALLOWED_EMAIL`: Single allowed user email address for access control

---

## 6. Implementation & Delivery Workflow

- **Feature-by-Feature Build**: Implement the application incrementally in logical phases.
- **Incremental Verification**: Provide explicit testing instructions and checkpoints after completing each feature.
- **Documentation**: Include a clean `README.md` explaining local setup, Supabase schema creation, and deployment steps.

---

## 7. Additional Requirements (Pre-Build Specifications)

> Where this section conflicts with earlier sections, this section takes precedence.

### Access Control & Security
- **Authentication**: Requires login via Supabase Auth (Email Magic Link or Email + Password).
- **Single-User Whitelist**: Verify authenticated user email against `ALLOWED_EMAIL` env var. Anyone else is immediately signed out and shown an "Unauthorized / Access Denied" page.
- **Protected Endpoints**: Every API route and Server Action must strictly verify the user session before executing (no unprotected endpoints triggering LLM calls or exposing resume/job data).
- **Row Level Security (RLS)**: Enable and enforce RLS policies across all Supabase database tables.
- **Secrets Isolation**: `SUPABASE_SERVICE_ROLE_KEY` and `GROQ_API_KEY` must remain strictly server-side. Never expose them with `NEXT_PUBLIC_` prefixes or import into client components.

### Realistic Filtering & Normalization
- **Location Matching**: Accept `India`, `IN` (case-sensitive country code), `Remote`, `Bangalore`, `Bengaluru`, `Mumbai`, `Pune`, `Gurgaon`, `Gurugram`, `Delhi`, `New Delhi`, `Noida`, `Hyderabad`, `Chennai`. Also accept `"Hybrid"` when paired with any of these approved locations.
- **Title Inclusions**: `Product Manager`, `APM`, `Associate Product`, `Product Owner`, `Product Analyst`.
- **Title Exclusions**: `Director`, `Head of`, `VP`, `Principal`, `Group Product`, `Staff`.
- **Whole-Word Matching & Case Sensitivity**:
  - All location and title rules must match whole words/phrases only (word boundaries), never raw substrings.
  - **`IN` is Case-Sensitive**: `IN` matches only as an uppercase standalone token (country code e.g., `"Bengaluru, IN"`). It must NEVER match lowercase `"in"` (such as in `"Hybrid in London"`) or inside words like `"Singapore"` or `"Berlin"`.
  - All other location and title terms remain case-insensitive. Same boundary enforcement for tokens like `APM`, `VP`, `Staff`.
- **Remote Eligibility Rules**:
  - Accept `Remote` only if it is paired with India/APAC or has no country/region attached.
  - Reject remote roles explicitly tied to another country/region (e.g., `"Remote - US"`, `"Remote (EU only)"`).
  - Flag general/unspecified remote roles (no country attached) with a `"Check eligibility"` UI badge.
- **Centralized Filter Config**: Keep all location, inclusion, and exclusion rules in a single configuration file (`src/config/filters.ts`) for easy user editing.
- **HTML Sanitization**: Strip HTML/tags from raw job descriptions before database persistence and before feeding into Groq LLM prompts.
- **Filter Unit Tests**: Provide comprehensive unit test suite covering at least:
  - `"Bengaluru, IN"` (PASS)
  - `"Singapore"` (FAIL)
  - `"Hybrid in London"` (FAIL)
  - `"Remote - US"` (FAIL)
  - `"Remote"` (PASS + `"Check eligibility"` badge)
  - `"Hybrid - Gurugram"` (PASS)
  - `"Director of Product"` (FAIL)
  - `"Associate Product Manager"` (PASS)

### LLM Queueing, Rate Limiting & Execution
- **Sequential Scoring Queue**: Score jobs one at a time with a configurable pacing delay between calls.
- **Rate-Limit Resilience (HTTP 429)**: Gracefully handle Groq 429 rate limit responses with backoff and retries rather than failing the entire batch.
- **Filter-Gated Scoring**: Only trigger scoring for jobs that pass all inclusion/exclusion filters.
- **Idempotency & Re-Scoring**: Do not re-score previously evaluated jobs unless the user explicitly triggers "Re-score".
- **Groq Model Configuration**: Store and reference the exact confirmed Groq Model ID as a single constant.

### Success Metrics & Feedback Tracking
- **Pipeline Analytics**:
  - Jobs found per week
  - % Shortlisted
  - Total applications sent
  - Referral requests sent
  - Interview rate (`Interviews / Applications`)
- **Fit-Score Sanity Check**: Thumbs up / thumbs down button per score to evaluate AI scoring accuracy over time.

---

## 8. Environment Constraint

- **No Local Commands**: `npm`, `node`, `next`, and similar commands CANNOT be run on the developer's local machine. Never instruct the user to run them locally and never mark a task "verified" based on a local run.
- **Vercel Previews & CI**: Builds and previews run on Vercel (preview deployment per push to GitHub). Build errors are read from Vercel's deployment logs.
- **Automated Testing**: Tests (`npm test`) and type checks run in GitHub Actions on every push.
- **Two-State Phase Completion**: Every phase has two distinct states:
  1. **"Code complete"**: All code and tests written and pushed.
  2. **"Verified"**: Its "done when" tests passed on the Vercel preview / GitHub Actions. Only mark a phase Verified after the user explicitly confirms the tests passed.
