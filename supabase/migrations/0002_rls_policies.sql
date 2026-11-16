-- 0002_rls_policies.sql
-- Políticas RLS separando technician e manager + bucket privado 'field-photos' (SPEC.md seção 5.2)

-- Funções auxiliares de autorização
create or replace function public.current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and active = true
  limit 1;
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active = true
  );
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'manager', false);
$$;

-- Ativar RLS em todas as tabelas
alter table public.profiles enable row level security;
alter table public.meter_groups enable row level security;
alter table public.meters enable row level security;
alter table public.meter_thresholds enable row level security;
alter table public.field_photos enable row level security;
alter table public.meter_readings enable row level security;
alter table public.reading_photos enable row level security;
alter table public.reading_audit_logs enable row level security;
alter table public.alerts enable row level security;
alter table public.push_subscriptions enable row level security;

-- PROFILES
create policy "profiles_select_own_or_manager"
  on public.profiles for select
  using (id = auth.uid() or public.is_manager());

create policy "profiles_insert_manager"
  on public.profiles for insert
  with check (public.is_manager());

create policy "profiles_update_manager"
  on public.profiles for update
  using (public.is_manager())
  with check (public.is_manager());

create policy "profiles_delete_manager"
  on public.profiles for delete
  using (public.is_manager());

-- METER_GROUPS (técnico vê apenas setores ativos no campo; gestor vê todos e gerencia)
create policy "meter_groups_select"
  on public.meter_groups for select
  using (
    public.is_manager()
    or (public.is_active_user() and is_active_in_field = true)
  );

create policy "meter_groups_insert_manager"
  on public.meter_groups for insert
  with check (public.is_manager());

create policy "meter_groups_update_manager"
  on public.meter_groups for update
  using (public.is_manager())
  with check (public.is_manager());

create policy "meter_groups_delete_manager"
  on public.meter_groups for delete
  using (public.is_manager());

-- METERS (técnico vê apenas medidores ativos no campo; gestor vê todos e gerencia)
create policy "meters_select"
  on public.meters for select
  using (
    public.is_manager()
    or (public.is_active_user() and is_active_in_field = true)
  );

create policy "meters_insert_manager"
  on public.meters for insert
  with check (public.is_manager());

create policy "meters_update_manager"
  on public.meters for update
  using (public.is_manager())
  with check (public.is_manager());

create policy "meters_delete_manager"
  on public.meters for delete
  using (public.is_manager());

-- METER_THRESHOLDS
create policy "meter_thresholds_select"
  on public.meter_thresholds for select
  using (
    public.is_manager()
    or (
      public.is_active_user()
      and exists (
        select 1
        from public.meters m
        where m.id = meter_id
          and m.is_active_in_field = true
      )
    )
  );

create policy "meter_thresholds_insert_manager"
  on public.meter_thresholds for insert
  with check (public.is_manager());

create policy "meter_thresholds_update_manager"
  on public.meter_thresholds for update
  using (public.is_manager())
  with check (public.is_manager());

create policy "meter_thresholds_delete_manager"
  on public.meter_thresholds for delete
  using (public.is_manager());

-- FIELD_PHOTOS
create policy "field_photos_select"
  on public.field_photos for select
  using (
    public.is_manager()
    or (public.is_active_user() and uploaded_by = auth.uid())
  );

create policy "field_photos_insert"
  on public.field_photos for insert
  with check (
    public.is_manager()
    or (public.is_active_user() and coalesce(uploaded_by, auth.uid()) = auth.uid())
  );

create policy "field_photos_update"
  on public.field_photos for update
  using (
    public.is_manager()
    or (public.is_active_user() and uploaded_by = auth.uid())
  )
  with check (
    public.is_manager()
    or (public.is_active_user() and uploaded_by = auth.uid())
  );

create policy "field_photos_delete_manager"
  on public.field_photos for delete
  using (public.is_manager());

-- METER_READINGS
-- Técnico lê leituras (inclusive dia anterior para validar queda/rollover),
-- insere como pending_review e só edita enquanto pending_review (ou no dia corrente antes de aprovação).
create policy "meter_readings_select"
  on public.meter_readings for select
  using (public.is_active_user());

create policy "meter_readings_insert"
  on public.meter_readings for insert
  with check (
    public.is_manager()
    or (
      public.is_active_user()
      and status = 'pending_review'
      and coalesce(created_by, auth.uid()) = auth.uid()
      and reviewed_by is null
      and reviewed_at is null
    )
  );

create policy "meter_readings_update"
  on public.meter_readings for update
  using (
    public.is_manager()
    or (
      public.is_active_user()
      and status = 'pending_review'
      and (
        created_by = auth.uid()
        or reading_date = (timezone('America/Sao_Paulo', now()))::date
      )
    )
  )
  with check (
    public.is_manager()
    or (
      public.is_active_user()
      and status = 'pending_review'
      and reviewed_by is null
      and reviewed_at is null
    )
  );

create policy "meter_readings_delete_manager"
  on public.meter_readings for delete
  using (public.is_manager());

-- READING_PHOTOS
create policy "reading_photos_select"
  on public.reading_photos for select
  using (public.is_active_user());

create policy "reading_photos_insert"
  on public.reading_photos for insert
  with check (
    public.is_manager()
    or (
      public.is_active_user()
      and exists (
        select 1
        from public.meter_readings r
        where r.id = reading_id
          and r.status = 'pending_review'
      )
    )
  );

create policy "reading_photos_delete"
  on public.reading_photos for delete
  using (
    public.is_manager()
    or (
      public.is_active_user()
      and exists (
        select 1
        from public.meter_readings r
        where r.id = reading_id
          and r.status = 'pending_review'
          and r.created_by = auth.uid()
      )
    )
  );

-- READING_AUDIT_LOGS (somente inserção e leitura; update/delete bloqueados também por trigger)
create policy "reading_audit_logs_select"
  on public.reading_audit_logs for select
  using (
    public.is_manager()
    or (public.is_active_user() and actor_id = auth.uid())
  );

create policy "reading_audit_logs_insert"
  on public.reading_audit_logs for insert
  with check (
    public.is_manager()
    or (public.is_active_user() and coalesce(actor_id, auth.uid()) = auth.uid())
  );

-- ALERTS
create policy "alerts_select"
  on public.alerts for select
  using (public.is_active_user());

create policy "alerts_insert"
  on public.alerts for insert
  with check (public.is_active_user());

create policy "alerts_update_manager"
  on public.alerts for update
  using (public.is_manager())
  with check (public.is_manager());

create policy "alerts_delete_manager"
  on public.alerts for delete
  using (public.is_manager());

-- PUSH_SUBSCRIPTIONS
create policy "push_subscriptions_select"
  on public.push_subscriptions for select
  using (public.is_manager() or (public.is_active_user() and user_id = auth.uid()));

create policy "push_subscriptions_insert"
  on public.push_subscriptions for insert
  with check (public.is_active_user() and user_id = auth.uid());

create policy "push_subscriptions_update"
  on public.push_subscriptions for update
  using (public.is_active_user() and user_id = auth.uid())
  with check (public.is_active_user() and user_id = auth.uid());

create policy "push_subscriptions_delete"
  on public.push_subscriptions for delete
  using (public.is_manager() or (public.is_active_user() and user_id = auth.uid()));

-- SUPABASE STORAGE: bucket privado 'field-photos'
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'field-photos',
  'field-photos',
  false,
  5242880,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "storage_field_photos_select"
  on storage.objects for select
  using (
    bucket_id = 'field-photos'
    and (
      public.is_manager()
      or (public.is_active_user() and owner = auth.uid())
    )
  );

create policy "storage_field_photos_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'field-photos'
    and public.is_active_user()
  );

create policy "storage_field_photos_update"
  on storage.objects for update
  using (
    bucket_id = 'field-photos'
    and (
      public.is_manager()
      or (public.is_active_user() and owner = auth.uid())
    )
  );

create policy "storage_field_photos_delete_manager"
  on storage.objects for delete
  using (
    bucket_id = 'field-photos'
    and public.is_manager()
  );
