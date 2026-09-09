-- Εκτέλεσε ολόκληρο το αρχείο μία φορά στο Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 30),
  color text not null default '#1f6a4b' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  sport text not null check (sport in ('basketball','volleyball','handball','badminton','football')),
  match_date date not null,
  match_time time not null,
  home uuid not null references public.teams(id) on delete restrict,
  away uuid not null references public.teams(id) on delete restrict,
  home_score integer check (home_score >= 0),
  away_score integer check (away_score >= 0),
  status text not null default 'scheduled' check (status in ('scheduled','completed')),
  created_at timestamptz not null default now(),
  constraint different_teams check (home <> away),
  constraint completed_has_score check (status = 'scheduled' or (home_score is not null and away_score is not null))
);

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.teams enable row level security;
alter table public.matches enable row level security;
alter table public.admins enable row level security;

drop policy if exists "Public can read teams" on public.teams;
create policy "Public can read teams" on public.teams for select using (true);
drop policy if exists "Public can read matches" on public.matches;
create policy "Public can read matches" on public.matches for select using (true);

drop policy if exists "Admins manage teams" on public.teams;
create policy "Admins manage teams" on public.teams for all to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists "Admins manage matches" on public.matches;
create policy "Admins manage matches" on public.matches for all to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists "Admin reads own role" on public.admins;
create policy "Admin reads own role" on public.admins for select to authenticated
using (user_id = auth.uid());

-- Προαιρετικά αρχικά δεδομένα. Τρέξε τα μόνο αν θέλεις τις τέσσερις ενδεικτικές ομάδες.
insert into public.teams (name, color) values
  ('Αετοί', '#e55c2b'), ('Κύμα', '#2076b9'), ('Παλμοί', '#7f57b5'), ('Σπίθα', '#d4a51e')
on conflict (name) do nothing;

-- Αφού δημιουργήσεις τον χρήστη στο Authentication → Users, κάνε τον διαχειριστή:
-- insert into public.admins (user_id)
-- select id from auth.users where email = 'TO_EMAIL_SOU';
