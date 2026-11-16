-- 0004_user_group_permissions.sql
-- Permissões por usuário x grupo/setor de medidores no Modo Campo

alter table public.profiles
  add column if not exists restrict_groups boolean not null default false;

create table if not exists public.user_meter_groups (
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid not null references public.meter_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, group_id)
);

create index if not exists idx_user_meter_groups_group
  on public.user_meter_groups (group_id);

alter table public.user_meter_groups enable row level security;

create policy "user_meter_groups_select"
  on public.user_meter_groups for select
  using (user_id = auth.uid() or public.is_manager());

create policy "user_meter_groups_insert_manager"
  on public.user_meter_groups for insert
  with check (public.is_manager());

create policy "user_meter_groups_update_manager"
  on public.user_meter_groups for update
  using (public.is_manager())
  with check (public.is_manager());

create policy "user_meter_groups_delete_manager"
  on public.user_meter_groups for delete
  using (public.is_manager());

create or replace function public.user_can_access_group(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      (
        select not p.restrict_groups
        from public.profiles p
        where p.id = auth.uid()
          and p.active = true
      ),
      false
    )
    or exists (
      select 1
      from public.user_meter_groups umg
      where umg.user_id = auth.uid()
        and umg.group_id = p_group_id
    );
$$;

alter policy "meter_groups_select"
  on public.meter_groups
  using (
    public.is_manager()
    or (
      public.is_active_user()
      and is_active_in_field = true
      and public.user_can_access_group(id)
    )
  );

alter policy "meters_select"
  on public.meters
  using (
    public.is_manager()
    or (
      public.is_active_user()
      and is_active_in_field = true
      and public.user_can_access_group(group_id)
    )
  );
