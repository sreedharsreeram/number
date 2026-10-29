# Deckle

A small arithmetic card game. Draw from a standard deck without aces (48 cards), combine two cards at a time with `+`, `−`, `×`, or `÷`, and reach the target exactly. `J`, `Q`, and `K` are worth 10. Each physical card can be used once in an expression; a calculated result becomes a new card. Division must be exact and every intermediate result must be a positive integer.

## Run locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173`. Guest practice works immediately. `pnpm build`, `pnpm test`, and `pnpm lint` check the project.

## System design

| Path | Responsibility |
| --- | --- |
| `src/engine/arithmetic.ts` | Pure deck, solver, generator, and move rules; no React or network calls |
| `src/App.tsx` | Responsive practice UI, account dialogs, and local puzzle progress |
| `src/components/ui/` | shadcn components |
| `src/lib/supabase.ts` | Supabase Auth and personal result storage |
| `public/cards/` | Self-hosted SVG playing-card art from [letele/playing-cards](https://github.com/letele/playing-cards), CC0 |
| `supabase/schema.sql` | Postgres result table, grants, and row level security |
| `api/admin/health.ts` | Vercel Function requiring a valid user JWT and server-side admin allowlist |

The client is a static Vite build served by Vercel. Supabase handles user credentials and persists practice results. The Vercel Function is only for protected admin APIs; no admin credentials or allowlist are bundled into the browser. The 48 card images are separate static files so a visitor loads only the hand dealt to them.

## The puzzle math

The solver uses a bitmask for each subset of dealt cards. For every split of a subset into two smaller subsets, it combines reachable integer values with all four operations, including both orders for subtraction and division. It stores a witness expression for each reachable value. Searching subsets in card-count order gives the *exact minimum number of cards* needed for each target under the game rules.

Easy, medium, and hard use 3, 4, and 5 digit targets that need at least 3, 4, and 5 cards respectively. The generator draws real, unique cards from the 48-card deck and accepts a target only after the solver proves it reachable and checks the minimum-card condition. Higher levels condition the deal on more 10-valued cards so five-digit targets are feasible. Quant Mode shows the minimum cards, the count of reachable numbers in that target range, and an optional example solution.

This follows the exhaustive expression approach used for the [Countdown numbers problem](https://www.cambridge.org/core/journals/journal-of-functional-programming/article/countdown-a-case-study-in-origami-programming/F7469590A11FDC55ED1C5401B0BD642D). Oxford's [numbers-game solver overview](https://www.cs.ox.ac.uk/admissions/undergraduate/courses/countdown.html) explains why exhaustive search matters: straight left-to-right calculations miss parenthesized solutions.

## Accounts and Vercel setup

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in its SQL Editor.
2. Copy `.env.example` to `.env.local` for local development. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to your project URL and **publishable** key. Never put a service-role key in a `VITE_` variable.
3. In Supabase Auth, set the site URL and allowed redirect URLs to the Vercel deployment and localhost. Keep email confirmation on. Configure production SMTP before public launch; Supabase's trial mail sender has a low limit.
4. For bot protection, configure Cloudflare Turnstile in Supabase Auth and set `VITE_TURNSTILE_SITE_KEY` in Vercel. The matching secret belongs only in Supabase. The sign-up and sign-in forms pass the Turnstile token when configured.
5. Import this repository in Vercel as a Vite project. Add the three `VITE_` variables above for the frontend. For the admin function, add `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `ADMIN_USER_IDS` (comma-separated Supabase user UUIDs) as server environment variables. Vercel builds with `pnpm build` and serves `dist`.

`GET /api/admin/health` returns `401` without a bearer token and `403` for a valid user who is not in `ADMIN_USER_IDS`. It checks the token with Supabase Auth on every request and sends `Cache-Control: no-store`. Any later admin endpoint must apply the same two checks before doing work. `vercel.json` sets a Content Security Policy and other browser security headers.

Supabase [row level security](https://supabase.com/docs/guides/database/postgres/row-level-security) restricts result reads and inserts to the signed-in user. Supabase Auth supplies [rate limits](https://supabase.com/docs/guides/auth/rate-limits); Vercel supplies [DDoS mitigation](https://vercel.com/docs/vercel-firewall/ddos-mitigation). Review the project limits and email capacity before a large launch.

Practice results are currently personal and submitted by the browser. They are private to their owner, but **not suitable for a public leaderboard**: a future competitive mode needs server-generated deals and server-verified moves. No public leaderboard or administrator dashboard is exposed in this version.
