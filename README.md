# Job Search Copilot

A personal web app that finds PM / APM openings, scores each one against your resume with AI, drafts a cover note and referral message, and tracks every application on one board.

It finds and prepares. **You apply.** The app never logs in to LinkedIn or Naukri, never scrapes, and never submits applications or messages on your behalf.

## What it does

| Area | What you get |
|---|---|
| **Job feed** | Pulls openings from public Greenhouse, Lever and Ashby job boards for the companies you add, plus JSearch queries and a "Paste a job" form. Keeps only product roles in India or remote, and removes duplicates. |
| **AI match score** | Compares each job with your resume (Groq LLM): a 0–100 fit score, top reasons, gaps, and which resume bullets to lead with. Bullets are checked word for word against your resume, so nothing is invented. |
| **ATS keyword scan** | Shows which keywords from the job post your resume covers and which it misses. |
| **Outreach** | Tailored cover note and LinkedIn referral message per job, with copy buttons. You send them yourself. |
| **Tracker** | Board of every application by stage, with notes, status history, follow-up reminders and pipeline numbers. |
| **Auto-fetch** | A GitHub Action calls the app every 6 hours to fetch new jobs and score them, within a daily cap. |

**Stack:** Next.js 15 (App Router) · Supabase (Postgres, Auth, Row Level Security) · Groq · Vercel · GitHub Actions

---

## 1. Before you start

- **Node.js 20+** and npm
- A **Supabase** project (the free tier is enough)
- A **Groq API key** from [console.groq.com](https://console.groq.com)
- Optional: a **RapidAPI key** for JSearch, if you want keyword-based job searches on top of company boards

## 2. Set up the database

In the Supabase dashboard, open **SQL Editor** and run each file in the `supabase/` folder **in number order**, one at a time:

```
01_profiles.sql
02_companies_and_jobs.sql
03_scoring.sql
04_score_error.sql
05_tailored_outreach.sql
06_applications.sql
07_cron_runs.sql
08_jsearch_and_dedupe.sql
09_multi_user.sql
10_ats_scanner.sql
```

Every table has Row Level Security turned on, so each signed-in user can only see their own rows.

## 3. Set up sign-in

1. Supabase → **Authentication → Sign In / Providers**: make sure **Email** is on.
2. Supabase → **Authentication → Users → Add user → Create new user**: enter the email you'll put in `ALLOWED_EMAIL`, set a password, and tick **Auto Confirm User**. The app has no sign-up page; this is the only way in.
3. Back in **Sign In / Providers**: turn **off** "Allow new users to sign up", so nobody else can register.
4. In **Authentication → Users**, copy your **User UID**. That's your `OWNER_USER_ID`.

Anyone who signs in with an email that isn't on the allowlist is signed out and sent to `/unauthorized`.

## 4. Environment variables

Copy the template and fill it in:

```bash
cp .env.example .env.local
```

| Variable | Where to get it | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | No (safe in browser) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` key | No (safe in browser) |
| `ALLOWED_EMAIL` | Your login email. `ALLOWED_EMAILS` also works, comma-separated, for more than one user | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key | **Yes** |
| `OWNER_USER_ID` | Supabase → Authentication → Users → your UID | — |
| `CRON_SECRET` | Any random string of 32+ characters, e.g. `openssl rand -hex 32` | **Yes** |
| `GROQ_API_KEY` | console.groq.com → API Keys | **Yes** |
| `GROQ_MODEL_PRIMARY` / `GROQ_MODEL_FALLBACK` | Optional. Defaults: `openai/gpt-oss-120b` / `openai/gpt-oss-20b` | — |
| `AUTO_SCORE_DAILY_CAP` | Optional. Jobs auto-scored per day (default 30) | — |
| `RAPIDAPI_KEY` | Optional. RapidAPI → JSearch | **Yes** |
| `JSEARCH_DAILY_QUERY_CAP` | Optional. JSearch queries per day (default 3) | — |

Never prefix a secret with `NEXT_PUBLIC_`: anything with that prefix is shipped to the browser.

## 5. Run it locally

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # 180 unit tests (Vitest)
npm run build    # production build
```

First run, in order:

1. **My Profile**: paste your resume text, your years of experience and target roles.
2. **Companies**: add companies by board type and slug (e.g. Greenhouse, `postman`), then **Fetch jobs**.
3. **Jobs**: press **Score All Pending**, open a job to see its fit, keyword scan and outreach drafts.
4. **Tracker**: track the jobs you apply to and move them through the stages.

## 6. Deploy to Vercel

1. Push the repo to GitHub, then in Vercel choose **Add New → Project** and import it.
2. Add every variable from step 4 under **Settings → Environment Variables** (Production, and Preview if you use previews).
3. Deploy. Then in Supabase → **Authentication → URL Configuration**, set **Site URL** to your Vercel URL.
4. Sign in on the live site and check that My Profile loads.

## 7. Turn on auto-fetch (every 6 hours)

The workflow in `.github/workflows/auto-fetch.yml` calls `POST /api/cron/fetch` on a schedule.

In GitHub → your repo → **Settings → Secrets and variables → Actions**, add:

- `APP_URL`: your Vercel URL, e.g. `https://job-search-copilot.vercel.app`
- `CRON_SECRET`: the same value as in Vercel

To test it now, go to **Actions → Auto Fetch Jobs → Run workflow**.

---

## Security

- Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `RAPIDAPI_KEY`, `CRON_SECRET`) are only read in server code. The library modules that use them import `server-only`, so the build fails if one is ever pulled into browser code. A check of the production bundle finds none of these names.
- Middleware blocks every page unless you're signed in with an allowed email. API routes answer **401** (not signed in) or **403** (email not allowed) as JSON instead of redirecting.
- Every server action checks the session and the allowlist again before doing anything.
- `/api/cron/fetch` accepts only `Authorization: Bearer <CRON_SECRET>`, compared in constant time.
- Row Level Security is on for all tables.

## Project docs

- `context.md`: product spec and hard rules
- `architecture.md`: how the pieces fit together
- `implementation-plan.md`: build phases and their checks
- `prompt.md`: every LLM prompt template used by the matcher, tailor and ATS scanner
