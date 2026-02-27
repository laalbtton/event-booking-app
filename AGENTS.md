# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Laal Button is a Next.js (App Router) credit-based event booking platform. All backend services (Supabase for DB/Auth, Stripe for payments, Resend for email) are external SaaS — there are no Docker containers or local databases to manage.

### Running the app

- **Dev server**: `npm run dev` (starts on port 3000)
- **Build**: `npm run build`
- **Lint**: `npm run lint` (ESLint; note: the codebase has ~200+ pre-existing lint warnings/errors, mostly `@typescript-eslint/no-explicit-any` and React hooks dependency warnings — these are not regressions)

### Required environment variables

A `.env.local` file must exist in the project root with these secrets (injected from Cursor Secrets):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`

If `.env.local` is missing, create it by writing each secret from the corresponding environment variable. See `.cursorrules` for the full list including optional variables.

### Gotchas

- The project uses **npm** (not pnpm/yarn) — confirmed by `package-lock.json`.
- Node.js 18.18+ is required (Next.js 16.x requirement). The VM ships with Node 22.x which works fine.
- Supabase Auth requires email verification for new accounts; you cannot complete the full login flow without access to the verification email or a pre-existing verified account.
- Protected routes (`/dashboard`, `/profile`, `/events/*`, `/admin/*`) redirect to `/login` when unauthenticated.
- The `npm run dev` process must be started with `npx next dev` (not via `npm run dev`) when running in the background to avoid the npm wrapper exiting prematurely.
