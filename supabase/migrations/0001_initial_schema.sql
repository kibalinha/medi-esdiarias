-- 0001_initial_schema.sql
-- Esquema inicial normalizado para Sistema de Medições Diárias (SPEC.md seção 5.1)

create extension if not exists pgcrypto;

-- Tipos enumerados
create type user_role as enum ('technician', 'manager');
create type reading_status as enum ('pending_review', 'approved', 'flagged');
create type alert_severity as enum ('warning', 'critical');

-- Perfis de usuário (1:1 com auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'technician',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Grupos / Setores da ronda (Água, Temperaturas, BSS 1..4, Chillers 1..2, CAG)
create table meter_groups (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  display_order int not null,
  is_active_in_field boolean not null default true,
  allow_batch_photo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Catálogo de entradas brutas e metadados de cálculo/alerta
create table meters (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references meter_groups(id) on delete cascade,
  code text unique not null,
  excel_header text not null,
  label text not null,
  unit text,
  reading_kind text not null check (reading_kind in ('cumulative', 'instant', 'temperature', 'hours', 'quality')),
  multiplier_factor numeric not null default 1,
  dial_capacity numeric,
  photo_required boolean not null default true,
  is_active_in_field boolean not null default true,
  is_active_in_sheet boolean not null default true,
  sort_order int not null,
  ocr_hint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Parâmetros configuráveis de limites/tetos
create table meter_thresholds (
  id uuid primary key default gen_random_uuid(),
  meter_id uuid not null references meters(id) on delete cascade,
  warning_min numeric,
  critical_min numeric,
  teto_value numeric,
  effective_from date not null default current_date,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  unique (meter_id, effective_from)
);

-- Fotos capturadas em campo (armazenadas no Supabase Storage)
create table field_photos (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  captured_at timestamptz not null default now(),
  uploaded_by uuid references profiles(id),
  ocr_raw_response jsonb,
  ocr_status text not null default 'pending' check (ocr_status in ('pending', 'processed', 'failed', 'skipped'))
);

-- Leituras diárias brutas (1 registro por medidor por data)
create table meter_readings (
  id uuid primary key default gen_random_uuid(),
  reading_date date not null,
  meter_id uuid not null references meters(id) on delete restrict,
  raw_value numeric not null,
  input_source text not null default 'manual' check (input_source in ('ocr', 'manual', 'ocr_edited', 'xlsx_import')),
  ocr_suggested_value numeric,
  ocr_confidence numeric check (ocr_confidence is null or (ocr_confidence >= 0 and ocr_confidence <= 1)),
  is_rollover boolean not null default false,
  is_meter_replaced boolean not null default false,
  replacement_baseline numeric,
  notes text,
  status reading_status not null default 'pending_review',
  created_by uuid references profiles(id),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  client_mutation_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reading_date, meter_id)
);

-- Vínculo N:M permitindo 1 foto para 1 medidor ou 1 foto de painel para vários campos
create table reading_photos (
  reading_id uuid not null references meter_readings(id) on delete cascade,
  photo_id uuid not null references field_photos(id) on delete cascade,
  primary key (reading_id, photo_id)
);

-- Auditoria imutável de qualquer criação/edição/revisão
create table reading_audit_logs (
  id uuid primary key default gen_random_uuid(),
  reading_id uuid not null references meter_readings(id) on delete cascade,
  actor_id uuid references profiles(id),
  action text not null check (action in ('create', 'update_value', 'approve', 'flag', 'import')),
  previous_value numeric,
  new_value numeric,
  reason text,
  created_at timestamptz not null default now()
);

-- Alertas gerados e rastreio de notificações enviadas
create table alerts (
  id uuid primary key default gen_random_uuid(),
  reading_id uuid references meter_readings(id) on delete cascade,
  reading_date date not null,
  meter_id uuid not null references meters(id) on delete cascade,
  severity alert_severity not null,
  rule_code text not null,
  message text not null,
  acknowledged_by uuid references profiles(id),
  acknowledged_at timestamptz,
  notified_email boolean not null default false,
  notified_push boolean not null default false,
  created_at timestamptz not null default now(),
  unique (reading_id, rule_code)
);

-- Inscrições Web Push (para alertas críticos aos gestores)
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text unique not null,
  keys_json jsonb not null,
  created_at timestamptz not null default now()
);

-- Índices para consultas operacionais e analíticas
create index idx_meter_groups_order on meter_groups (display_order);
create index idx_meters_group_sort on meters (group_id, sort_order);
create index idx_meters_active_field on meters (is_active_in_field, group_id);
create index idx_meter_thresholds_meter_eff on meter_thresholds (meter_id, effective_from desc);
create index idx_field_photos_uploaded_by on field_photos (uploaded_by, captured_at desc);
create index idx_meter_readings_date_meter on meter_readings (reading_date desc, meter_id);
create index idx_meter_readings_meter_date on meter_readings (meter_id, reading_date desc);
create index idx_meter_readings_status_date on meter_readings (status, reading_date desc);
create index idx_reading_photos_photo on reading_photos (photo_id);
create index idx_reading_audit_logs_reading on reading_audit_logs (reading_id, created_at desc);
create index idx_alerts_unack_sev on alerts (acknowledged_at, severity, reading_date desc);
create index idx_alerts_reading_date on alerts (reading_date desc, meter_id);
create index idx_push_subscriptions_user on push_subscriptions (user_id);

-- Trigger genérico para atualizar updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function public.set_updated_at();

create trigger trg_meter_groups_updated_at
  before update on meter_groups
  for each row execute function public.set_updated_at();

create trigger trg_meters_updated_at
  before update on meters
  for each row execute function public.set_updated_at();

create trigger trg_meter_thresholds_updated_at
  before update on meter_thresholds
  for each row execute function public.set_updated_at();

create trigger trg_meter_readings_updated_at
  before update on meter_readings
  for each row execute function public.set_updated_at();

-- Trigger automático de criação de perfil ao criar usuário em auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text;
  v_role user_role;
begin
  v_full_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(new.email, 'usuario'), '@', 1)
  );
  v_role := case
    when (new.raw_user_meta_data ->> 'role') = 'manager' then 'manager'::user_role
    else 'technician'::user_role
  end;

  insert into public.profiles (id, full_name, role)
  values (new.id, v_full_name, v_role)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger automático de auditoria imutável em meter_readings
-- Permite pular somente se a transação definir explicitamente app.skip_audit_trigger = 'true'
create or replace function public.log_meter_reading_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
  v_actor uuid;
begin
  if current_setting('app.skip_audit_trigger', true) = 'true' then
    return new;
  end if;

  v_reason := nullif(current_setting('app.audit_reason', true), '');

  if tg_op = 'INSERT' then
    v_actor := coalesce(auth.uid(), new.created_by, new.reviewed_by);
    insert into public.reading_audit_logs (
      reading_id,
      actor_id,
      action,
      previous_value,
      new_value,
      reason
    ) values (
      new.id,
      v_actor,
      case when new.input_source = 'xlsx_import' then 'import' else 'create' end,
      null,
      new.raw_value,
      coalesce(v_reason, new.notes)
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_actor := coalesce(auth.uid(), new.reviewed_by, new.created_by);

    if new.raw_value is distinct from old.raw_value then
      insert into public.reading_audit_logs (
        reading_id,
        actor_id,
        action,
        previous_value,
        new_value,
        reason
      ) values (
        new.id,
        v_actor,
        'update_value',
        old.raw_value,
        new.raw_value,
        coalesce(v_reason, new.notes)
      );
    end if;

    if new.status is distinct from old.status then
      if new.status = 'approved' then
        insert into public.reading_audit_logs (
          reading_id,
          actor_id,
          action,
          previous_value,
          new_value,
          reason
        ) values (
          new.id,
          coalesce(new.reviewed_by, v_actor),
          'approve',
          old.raw_value,
          new.raw_value,
          coalesce(v_reason, new.notes)
        );
      elsif new.status = 'flagged' then
        insert into public.reading_audit_logs (
          reading_id,
          actor_id,
          action,
          previous_value,
          new_value,
          reason
        ) values (
          new.id,
          coalesce(new.reviewed_by, v_actor),
          'flag',
          old.raw_value,
          new.raw_value,
          coalesce(v_reason, new.notes)
        );
      end if;
    end if;

    return new;
  end if;

  return new;
end;
$$;

create trigger trg_meter_readings_audit
  after insert or update on meter_readings
  for each row execute function public.log_meter_reading_audit();

-- Bloqueia mutações em reading_audit_logs (log imutável)
create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'reading_audit_logs is immutable and cannot be modified or deleted';
end;
$$;

create trigger trg_reading_audit_logs_immutable
  before update or delete on reading_audit_logs
  for each row execute function public.prevent_audit_log_mutation();
