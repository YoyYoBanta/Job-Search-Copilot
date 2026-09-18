# Job Search Copilot — System Architecture (Phase 1)

This document reflects the actual implemented architecture, directory structure, data models, and access control flows as of **Phase 1**.

---

## 1. Directory Structure

```
Job AI/
├── .github/
│   └── workflows/
│       └── ci.yml                   # Automated CI workflow (lint, typecheck, test, build)
├── .env.example                     # Environment template with required keys
├── .gitignore                       # Node, Next.js, and secret ignore rules
├── package.json                     # Next.js 15, React 19, Supabase SSR dependencies
├── tsconfig.json                    # TypeScript compiler configuration & path aliases (@/*)
├── next.config.mjs                  # Next.js runtime configuration
├── context.md                       # Canonical requirements & specifications
├── implementation-plan.md           # Master phased delivery plan & checklist
├── architecture.md                  # This architecture document
├── supabase/
│   └── migrations/
│       └── 01_profiles.sql          # Phase 1 profiles table & RLS policies
└── src/
    ├── middleware.ts                # Session refresh & ALLOWED_EMAIL edge protection
    ├── lib/
    │   ├── auth.ts                  # Server-side auth & whitelist verification helpers
    │   └── supabase/
    │       ├── client.ts            # Browser client helper (@supabase/ssr)
    │       └── server.ts            # Async server client helper (@supabase/ssr + cookies)
    ├── components/
    │   ├── Navbar.tsx               # Global navigation, brand badge, user email & logout
    │   ├── LocalTime.tsx            # Client browser timezone formatter component
    │   └── ResumeEditor.tsx         # Client resume text editor with live metrics & alert states
    └── app/
        ├── globals.css              # Vanilla CSS dark design system & tokens
        ├── layout.tsx               # Root layout wrapper with Navbar and main container
        ├── page.tsx                 # Protected home dashboard
        ├── login/
        │   ├── page.tsx             # Email + Password login interface
        │   └── actions.ts           # Server action for authentication & whitelist enforcement
        ├── unauthorized/
        │   └── page.tsx             # Access denied screen with sign-out trigger
        └── profile/
            ├── page.tsx             # Server page loading resume data
            └── actions.ts           # Server action for saving resume to Supabase
```

---

## 2. Implemented Database Schema (Phase 1)

### `public.profiles`
Stores the single authorized user's master resume text.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique profile record identifier |
| `user_id` | `UUID` | `NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE` | Scoped Supabase Auth user ID |
| `resume_text` | `TEXT` | `NOT NULL DEFAULT ''` | Plain text / markdown resume payload |
| `created_at` | `TIMESTAMPTZ`| `NOT NULL DEFAULT now()` | Initial creation timestamp |
| `updated_at` | `TIMESTAMPTZ`| `NOT NULL DEFAULT now()` | Auto-updated on record changes |

### Row Level Security (RLS) Policies
- **`Users can view their own profile`**: `FOR SELECT USING (auth.uid() = user_id)`
- **`Users can insert their own profile`**: `FOR INSERT WITH CHECK (auth.uid() = user_id)`
- **`Users can update their own profile`**: `FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`
- **`Users can delete their own profile`**: `FOR DELETE USING (auth.uid() = user_id)`
- **Trigger**: `set_profiles_updated_at` executes `handle_updated_at()` before update.

---

## 3. Authentication & Authorization Flow

```
                      +-----------------------------+
                      |   Incoming HTTP Request     |
                      +--------------+--------------+
                                     |
                                     v
                       [ Next.js middleware.ts ]
                                     |
                   +-----------------+-----------------+
                   |                                   |
         (Unauthenticated)                     (Authenticated)
                   |                                   |
         +---------v---------+                         v
         | Is Public Route?  |            Check user.email against
         | (/login, etc.)    |                 ALLOWED_EMAIL
         +----+---------+----+                         |
              |         |              +---------------+---------------+
            (Yes)      (No)            |                               |
              |         |          (Matches)                     (Mismatch)
              |         v              |                               |
              |   Redirect to          v                               v
              |     /login     Allow request to proceed         Redirect to
              |                        |                      /unauthorized
              v                        v                               |
         Render Page       [ Server Action / Page ]                    v
                           Calls requireAuth() checks          Sign-out action
```

### Protection Layers
1. **Edge Middleware (`src/middleware.ts`)**:
   - Refreshes session tokens via `@supabase/ssr`.
   - Blocks unauthorized access before routes are hit.
2. **Server-Level Guard (`src/lib/auth.ts: requireAuth()`)**:
   - Every Server Component (`/`, `/profile`) and Server Action (`saveResumeAction`) explicitly calls `requireAuth()` before executing business logic.
3. **Database Guard (Supabase RLS)**:
   - Queries are executed using the authenticated user's JWT context, ensuring cross-user data isolation at the Postgres layer.

---

## 4. Resume Management Flow

1. User navigates to `/profile`.
2. `src/app/profile/page.tsx` executes `requireAuth()`, queries `public.profiles` for `user_id = auth.uid()`, and passes `resume_text` to `<ResumeEditor />`.
3. User edits text, viewing live word and character counters.
4. User clicks "Save Resume Profile" triggering `saveResumeAction` (`src/app/profile/actions.ts`).
5. Server action validates authorization, upserts the record in `public.profiles`, revalidates the cache (`revalidatePath('/profile')`), and returns timestamped confirmation.
