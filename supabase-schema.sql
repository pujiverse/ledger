-- BizManager Lite — database schema (multi-user version)
-- Paste this whole file into Supabase ▸ SQL Editor ▸ New query, then click Run.
-- It is idempotent: safe to re-run any time.
--
-- After the run:
--   - Sign up the very first user from the app's login screen.
--     They are automatically promoted to "admin" (see handle_new_user below).
--   - Any subsequent signups are "customer" by default.
--   - Customers see only their own rows. Admins see every row.

-- =============================================================
-- 1. PROFILES + ROLES
-- =============================================================

create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'customer' check (role in ('customer','admin')),
  created_at  timestamptz not null default now()
);

-- Auto-create a profile when someone signs up.
-- The very FIRST user to sign up becomes the admin (your account).
-- Everyone after that is a customer until you promote them in the UI.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_first boolean;
begin
  select count(*) = 0 into is_first from public.profiles;
  insert into public.profiles (id, email, role)
  values (new.id, new.email, case when is_first then 'admin' else 'customer' end)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Tiny helper used by every data-table policy.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

alter table profiles enable row level security;
drop policy if exists "profiles_self_or_admin_select" on profiles;
create policy "profiles_self_or_admin_select" on profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_self_update"      on profiles;
create policy "profiles_self_update" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_admin_update_all" on profiles;
create policy "profiles_admin_update_all" on profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- =============================================================
-- 2. DATA TABLES
-- =============================================================

create table if not exists customers (
  id          bigserial primary key,
  name        text not null,
  phone       text,
  address     text,
  status      text not null default 'Active' check (status in ('Active','Inactive')),
  created_at  timestamptz not null default now()
);

create table if not exists customer_transactions (
  id           bigserial primary key,
  customer_id  bigint not null references customers(id) on delete cascade,
  date         date not null default current_date,
  amount       numeric(14,2) not null,
  description  text,
  type         text not null check (type in ('Given','Received'))
);

create table if not exists expenses (
  id            bigserial primary key,
  expense_date  date not null default current_date,
  description   text not null,
  category      text,
  amount        numeric(14,2) not null,
  type          text not null check (type in ('Income','Expense'))
);

create table if not exists loans (
  id               bigserial primary key,
  name             text not null,
  principal        numeric(14,2) not null,
  interest_rate    numeric(5,2) default 0,
  duration_months  int default 0,
  type             text not null check (type in ('Taken','Given')),
  status           text not null default 'Active' check (status in ('Active','Paid Off')),
  created_at       timestamptz not null default now()
);

create table if not exists loan_transactions (
  id           bigserial primary key,
  loan_id      bigint not null references loans(id) on delete cascade,
  date         date not null default current_date,
  amount       numeric(14,2) not null,
  description  text,
  type         text not null check (type in ('Payment','Disbursement'))
);

-- ----- Chits (Mom's monthly chit groups) -----
create table if not exists chits (
  id              bigserial primary key,
  name            text not null,
  total_value     numeric(14,2) not null default 0,
  members_count   int not null default 0,
  duration_months int not null default 0,
  status          text not null default 'Ongoing' check (status in ('Ongoing','Completed')),
  created_at      timestamptz not null default now()
);

create table if not exists chit_members (
  id              bigserial primary key,
  chit_id         bigint not null references chits(id) on delete cascade,
  name            text not null,
  phone           text,
  email           text,
  address         text,
  lottery_status  text not null default 'Pending' check (lottery_status in ('Pending','Won')),
  created_at      timestamptz not null default now()
);

create table if not exists chit_transactions (
  id           bigserial primary key,
  member_id    bigint not null references chit_members(id) on delete cascade,
  date         date not null default current_date,
  amount       numeric(14,2) not null,
  description  text,
  type         text not null check (type in ('Given','Received'))
);

-- =============================================================
-- 3. OWNERSHIP COLUMN — added to every data table
--    owner_id defaults to the currently-authenticated user.
-- =============================================================

do $$
declare t text;
begin
  for t in select unnest(array[
    'customers','customer_transactions','expenses','loans','loan_transactions',
    'chits','chit_members','chit_transactions'
  ]) loop
    execute format(
      'alter table %I add column if not exists owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade;',
      t);
    execute format('create index if not exists %I on %I (owner_id);', t || '_owner_idx', t);
  end loop;
end $$;

-- =============================================================
-- 4. ROW LEVEL SECURITY — same rule on every data table:
--    "you can read/write rows you own, OR if you're an admin you can do anything"
-- =============================================================

do $$
declare t text;
begin
  for t in select unnest(array[
    'customers','customer_transactions','expenses','loans','loan_transactions',
    'chits','chit_members','chit_transactions'
  ]) loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "%1$s_owner_or_admin" on %1$I;', t);
    execute format($p$
      create policy "%1$s_owner_or_admin" on %1$I
      for all
      using      (auth.uid() = owner_id or public.is_admin())
      with check (auth.uid() = owner_id or public.is_admin());
    $p$, t);
  end loop;
end $$;
