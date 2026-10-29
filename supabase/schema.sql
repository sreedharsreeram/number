-- Run once in the Supabase SQL Editor before enabling account stats.
create table if not exists public.practice_results (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  difficulty smallint not null check (difficulty in (3, 4, 5)),
  won boolean not null,
  guesses smallint not null check (guesses between 1 and 7),
  duration_ms integer not null check (duration_ms >= 0),
  played_at timestamptz not null default now()
);

create index if not exists practice_results_user_date_idx
  on public.practice_results (user_id, played_at desc);

alter table public.practice_results enable row level security;

revoke all on table public.practice_results from anon, authenticated;
grant select, insert on table public.practice_results to authenticated;

create policy "Players can read their own results"
  on public.practice_results for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Players can save their own results"
  on public.practice_results for insert to authenticated
  with check ((select auth.uid()) = user_id);
