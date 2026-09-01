-- FlyAI hackathon judging — Supabase schema
-- Run this once in the SQL editor of a fresh Supabase project.
--
-- This file deliberately contains NO idea data. It lives in a public repo,
-- and the idea titles and leader names are exactly what the access code is
-- meant to protect — seeding them from here would hand them to anyone who
-- opens the repository. Load the ideas from the app instead:
-- Settings -> Cloud sync -> "אתחול הענן", which uploads the list from the
-- copy your device already decrypted.

-- 1. Tables ------------------------------------------------------------------

create table if not exists flyai_ideas (
  id      int primary key,
  title   text not null,
  leader  text not null,
  domain  text
);

create table if not exists flyai_judges (
  id          text primary key,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists flyai_scores (
  judge_id    text not null,
  idea_id     int  not null,
  stage       int  not null default 1,
  criteria    jsonb not null default '{}'::jsonb,
  notes       text not null default '',
  starred     boolean not null default false,
  skipped     boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (judge_id, idea_id, stage)
);

create table if not exists flyai_settings (
  id          int primary key default 1,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- 2. Access ------------------------------------------------------------------
-- The app authenticates with the project's anon key only: every judge shares
-- one identity, and the app distinguishes them by the judge id it sends.
-- These policies therefore grant anon full access to the four tables. Anyone
-- holding the URL + anon key can read and write the results, so treat that
-- pair as the shared password for the panel and do not publish it.

alter table flyai_ideas    enable row level security;
alter table flyai_judges   enable row level security;
alter table flyai_scores   enable row level security;
alter table flyai_settings enable row level security;

drop policy if exists anon_all on flyai_ideas;
drop policy if exists anon_all on flyai_judges;
drop policy if exists anon_all on flyai_scores;
drop policy if exists anon_all on flyai_settings;

create policy anon_all on flyai_ideas    for all to anon using (true) with check (true);
create policy anon_all on flyai_judges   for all to anon using (true) with check (true);
create policy anon_all on flyai_scores   for all to anon using (true) with check (true);
create policy anon_all on flyai_settings for all to anon using (true) with check (true);

-- 3. Live updates ------------------------------------------------------------
-- Lets every open dashboard refresh the moment another judge saves a card.

alter publication supabase_realtime add table flyai_ideas;
alter publication supabase_realtime add table flyai_judges;
alter publication supabase_realtime add table flyai_scores;
alter publication supabase_realtime add table flyai_settings;

-- 4. Loading the ideas -------------------------------------------------------
-- Open the app, go to Settings -> Cloud sync, paste the Project URL and anon
-- key, press "התחבר", then press "אתחול הענן". The 65 ideas upload from your
-- device. Verify with:  select count(*) from flyai_ideas;
