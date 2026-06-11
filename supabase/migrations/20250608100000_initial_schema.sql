-- Базовая схема PVZ Manager (Supabase / PostgreSQL)
-- Запуск: Supabase Dashboard → SQL Editor или supabase db push

create extension if not exists "pgcrypto";

-- ========== ENUMS ==========
do $$ begin
  create type public.user_role as enum ('owner', 'admin', 'employee');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.user_status as enum ('active', 'pending', 'blocked');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.shift_status as enum ('planned', 'active', 'completed', 'paid');
exception when duplicate_object then null;
end $$;

-- ========== PROFILES (привязка к auth.users) ==========
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  role public.user_role not null default 'employee',
  status public.user_status not null default 'active',
  pvz_id uuid,
  pvz_ids uuid[] default '{}',
  permission_level text check (permission_level in ('full', 'restricted')),
  permissions jsonb not null default '{}'::jsonb,
  avatar_uri text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_pvz_id_idx on public.profiles (pvz_id);
create index if not exists profiles_role_idx on public.profiles (role);

-- ========== ПВЗ ==========
create table if not exists public.pvz (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  name text not null,
  address text not null default '',
  work_start text not null default '09:00',
  work_end text not null default '21:00',
  working_hours text not null default '09:00 - 21:00',
  phone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pvz_owner_id_idx on public.pvz (owner_id);

alter table public.profiles
  drop constraint if exists profiles_pvz_id_fkey;

alter table public.profiles
  add constraint profiles_pvz_id_fkey
  foreign key (pvz_id) references public.pvz (id) on delete set null;

-- ========== СМЕНЫ ==========
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  pvz_id uuid not null references public.pvz (id) on delete cascade,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  employee_name text not null,
  date date not null,
  start_time text not null,
  end_time text not null,
  status public.shift_status not null default 'planned',
  shift_type text,
  total_hours numeric(8, 2),
  earnings numeric(12, 2),
  payment_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shifts_employee_id_idx on public.shifts (employee_id);
create index if not exists shifts_pvz_id_idx on public.shifts (pvz_id);
create index if not exists shifts_date_idx on public.shifts (date);

-- ========== ЗАЯВКИ НА СМЕНЫ ==========
create table if not exists public.shift_requests (
  id uuid primary key default gen_random_uuid(),
  pvz_id uuid not null references public.pvz (id) on delete cascade,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  employee_name text not null,
  date date not null,
  start_time text not null,
  end_time text not null,
  status text not null default 'pending',
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists shift_requests_pvz_id_idx on public.shift_requests (pvz_id);
create index if not exists shift_requests_employee_id_idx on public.shift_requests (employee_id);

-- ========== ОБМЕН СМЕНАМИ ==========
create table if not exists public.swap_requests (
  id uuid primary key default gen_random_uuid(),
  pvz_id uuid not null references public.pvz (id) on delete cascade,
  from_employee_id uuid not null references public.profiles (id) on delete cascade,
  to_employee_id uuid not null references public.profiles (id) on delete cascade,
  from_shift_id uuid references public.shifts (id) on delete set null,
  to_shift_id uuid references public.shifts (id) on delete set null,
  from_date date,
  to_date date,
  status text not null default 'pending',
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists swap_requests_pvz_id_idx on public.swap_requests (pvz_id);

-- ========== ПРИГЛАШЕНИЯ ==========
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  pvz_id uuid not null references public.pvz (id) on delete cascade,
  invited_by uuid not null references public.profiles (id) on delete cascade,
  phone text not null,
  name text not null,
  role public.user_role not null default 'employee',
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists invitations_pvz_id_idx on public.invitations (pvz_id);

-- ========== ВЫПЛАТЫ ==========
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  pvz_id uuid not null references public.pvz (id) on delete cascade,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(12, 2) not null,
  period_start date,
  period_end date,
  status text not null default 'pending',
  note text,
  created_at timestamptz not null default now()
);

create index if not exists payments_pvz_id_idx on public.payments (pvz_id);
create index if not exists payments_employee_id_idx on public.payments (employee_id);

-- ========== ШТРАФЫ / БОНУСЫ ==========
create table if not exists public.penalties (
  id uuid primary key default gen_random_uuid(),
  pvz_id uuid not null references public.pvz (id) on delete cascade,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('fine', 'bonus')),
  amount numeric(12, 2) not null,
  reason text not null default '',
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists penalties_pvz_id_idx on public.penalties (pvz_id);
create index if not exists penalties_employee_id_idx on public.penalties (employee_id);

-- ========== НАСТРОЙКИ ЗАРПЛАТЫ ==========
create table if not exists public.global_salary_settings (
  id uuid primary key default gen_random_uuid(),
  pvz_id uuid not null unique references public.pvz (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_salary_settings (
  id uuid primary key default gen_random_uuid(),
  pvz_id uuid not null references public.pvz (id) on delete cascade,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (pvz_id, employee_id)
);

-- ========== УВЕДОМЛЕНИЯ ==========
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'system',
  is_read boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on public.notifications (user_id);

-- ========== ЧАТ ==========
create table if not exists public.chat_rooms (
  id text primary key,
  pvz_id uuid not null references public.pvz (id) on delete cascade,
  type text not null check (type in ('general', 'private')),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.chat_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  user_name text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_room_id_idx on public.chat_messages (room_id);

create table if not exists public.chat_members (
  room_id text not null references public.chat_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  unread_count integer not null default 0,
  last_read_at timestamptz,
  primary key (room_id, user_id)
);

-- Автосоздание профиля при регистрации
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, phone, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'Пользователь'),
    coalesce(new.raw_user_meta_data->>'phone', new.phone, ''),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'employee')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
