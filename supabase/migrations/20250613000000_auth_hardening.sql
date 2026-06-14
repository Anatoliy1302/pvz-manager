-- Auth hardening: нормализация телефона, ограничение upsert профиля, индекс уникальности

-- ========== NORMALIZE PHONE (reuse / extend) ==========
create or replace function public.normalize_phone(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p, ''), '\D', '', 'g');
$$;

-- ========== UNIQUE PHONE INDEX (normalized) ==========
create unique index if not exists profiles_phone_normalized_unique
  on public.profiles (public.normalize_phone(phone))
  where public.normalize_phone(phone) <> '';

-- ========== SECURITY: профиль при регистрации — только employee, роль меняет upsert приложения ==========
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_phone text;
begin
  normalized_phone := public.normalize_phone(
    coalesce(new.raw_user_meta_data->>'phone', new.phone, '')
  );

  insert into public.profiles (id, name, phone, email, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'Пользователь'),
    normalized_phone,
    new.email,
    'employee',
    'active'
  )
  on conflict (id) do update set
    phone = excluded.phone,
    updated_at = now()
  where public.profiles.phone = '' or public.profiles.phone is null;

  return new;
end;
$$;

-- ========== SECURITY: пользователь может обновлять свой профиль (в т.ч. role при первой привязке) ==========
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ========== SECURITY: запрет insert профиля напрямую (только trigger + service role upsert) ==========
drop policy if exists "profiles_insert_authenticated" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;

-- upsert из приложения (linkSupabaseProfile) — authenticated user inserts/updates own row
drop policy if exists "profiles_upsert_own" on public.profiles;
create policy "profiles_upsert_own"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

-- ========== INVITATIONS: lookup by normalized phone ==========
drop policy if exists "invitations_select_by_phone" on public.invitations;
create policy "invitations_select_by_phone"
  on public.invitations for select to authenticated
  using (
    public.normalize_phone(phone) = public.normalize_phone(
      (select phone from public.profiles where id = auth.uid())
    )
  );
