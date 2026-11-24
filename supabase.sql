-- Run once in the Supabase SQL editor. Tables are closed (RLS, no policies);
-- anon can only call the four functions below.
create extension if not exists pgcrypto with schema extensions;

create table if not exists profiles (
  name text primary key check (name ~ '^[A-Za-zÀ-ÿ0-9 _.-]{2,20}$'),
  pw_hash text not null,
  answered int not null default 0,
  right_count int not null default 0
);
create unique index if not exists profiles_name_ci on profiles (lower(name));
alter table profiles enable row level security;

create or replace function register(p_name text, p_pw text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_name !~ '^[A-Za-zÀ-ÿ0-9 _.-]{2,20}$' then raise exception 'bad_name'; end if;
  if length(p_pw) < 4 then raise exception 'short_pw'; end if;
  insert into profiles (name, pw_hash) values (p_name, crypt(p_pw, gen_salt('bf')));
exception when unique_violation then raise exception 'taken';
end $$;

-- returns the canonical name, or null when name/password do not match
create or replace function login(p_name text, p_pw text) returns text
language sql security definer set search_path = public, extensions as $$
  select name from profiles where lower(name) = lower(p_name) and pw_hash = crypt(p_pw, pw_hash);
$$;

create or replace function submit_score(p_name text, p_pw text, p_answered int, p_right int) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_answered not between 1 and 5000 or p_right not between 0 and p_answered then raise exception 'bad_score'; end if;
  update profiles set answered = answered + p_answered, right_count = right_count + p_right
    where lower(name) = lower(p_name) and pw_hash = crypt(p_pw, pw_hash);
  if not found then raise exception 'bad_credentials'; end if;
end $$;

create or replace function leaderboard() returns table (name text, answered int, right_count int)
language sql security definer set search_path = public as $$
  select name, answered, right_count from profiles where answered > 0 order by right_count desc, answered asc limit 20;
$$;

-- The class password that opens docs/data/bundle.enc. Released only to a valid profile.
-- Set it once (never in the repo):  insert into app_secret values ('class', '<password>') on conflict (k) do update set v = excluded.v;
create table if not exists app_secret (k text primary key, v text not null);
alter table app_secret enable row level security;

create or replace function unlock_key(p_name text, p_pw text) returns text
language sql security definer set search_path = public, extensions as $$
  select v from app_secret where k = 'class'
    and exists (select 1 from profiles where lower(name) = lower(p_name) and pw_hash = crypt(p_pw, pw_hash));
$$;

revoke all on function register, login, submit_score, leaderboard, unlock_key from public;
grant execute on function register, login, submit_score, leaderboard, unlock_key to anon;
