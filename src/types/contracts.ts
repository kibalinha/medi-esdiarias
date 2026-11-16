export type UserRole = "technician" | "manager";

export type ReadingStatus = "pending_review" | "approved" | "flagged";

export type AlertSeverity = "warning" | "critical";

export type EvaluationSeverity = "ok" | "warning" | "critical";

export type ReadingKind =
  | "cumulative"
  | "instant"
  | "temperature"
  | "hours"
  | "quality";

export type InputSource = "ocr" | "manual" | "ocr_edited" | "xlsx_import";

export type OcrStatus = "pending" | "processed" | "failed" | "skipped";

export type AuditAction =
  | "create"
  | "update_value"
  | "approve"
  | "flag"
  | "import";

export type SpreadsheetColumnKind =
  | "KEY"
  | "INPUT"
  | "CALCULATED"
  | "REFERENCE_YOY"
  | "CONFIG";

export type AlertRuleCode =
  | "CONDUTIVIMETRO_ALTO"
  | "CONDUTIVIMETRO_CRITICO"
  | "DEMANDA_ATENCAO"
  | "DEMANDA_TETO"
  | "QUEDA_MEDIDOR"
  | "CAG_AGUA_ANOMALIA";

export interface AuthUserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  active: boolean;
  restrict_groups?: boolean;
  allowed_group_ids?: string[];
}

export interface AuthMeResponse {
  user: AuthUserProfile | null;
  data_mode: "supabase" | "local";
}

export interface MeterGroupDto {
  id: string;
  slug: string;
  name: string;
  display_order: number;
  is_active_in_field: boolean;
  allow_batch_photo: boolean;
}

export interface MeterThresholdDto {
  id: string;
  meter_id: string;
  warning_min: number | null;
  critical_min: number | null;
  teto_value: number | null;
  effective_from: string;
  updated_by: string | null;
  updated_at: string;
}

export interface MeterDto {
  id: string;
  group_id: string;
  group_slug: string;
  code: string;
  excel_header: string;
  label: string;
  unit: string | null;
  reading_kind: ReadingKind;
  multiplier_factor: number;
  dial_capacity: number | null;
  photo_required: boolean;
  is_active_in_field: boolean;
  is_active_in_sheet: boolean;
  sort_order: number;
  ocr_hint: string | null;
  threshold: MeterThresholdDto | null;
}

export interface PreviousReadingRefDto {
  meter_id: string;
  meter_code: string;
  reading_date: string;
  raw_value: number;
  is_rollover: boolean;
  is_meter_replaced: boolean;
}

export interface CampoTodayReadingDto {
  id: string;
  meter_id: string;
  meter_code: string;
  reading_date: string;
  raw_value: number;
  input_source: InputSource;
  ocr_suggested_value: number | null;
  ocr_confidence: number | null;
  is_rollover: boolean;
  is_meter_replaced: boolean;
  replacement_baseline: number | null;
  notes: string | null;
  status: ReadingStatus;
  photo_ids: string[];
  client_mutation_id: string | null;
}

export interface AlertDto {
  id: string;
  reading_id: string | null;
  reading_date: string;
  meter_id: string;
  meter_code: string;
  meter_label: string;
  severity: AlertSeverity;
  rule_code: AlertRuleCode | string;
  message: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  notified_email: boolean;
  notified_push: boolean;
  created_at: string;
}

export interface CampoBootstrapResponse {
  date: string;
  user: AuthUserProfile;
  groups: MeterGroupDto[];
  meters: MeterDto[];
  previous_readings: Record<string, PreviousReadingRefDto>;
  existing_readings_today: Record<string, CampoTodayReadingDto>;
  active_alerts: AlertDto[];
}

export interface OcrExtractRequest {
  image_base64: string;
  mime_type?: "image/webp" | "image/jpeg" | "image/png";
  group_slug: string;
  meter_ids?: string[];
  meter_codes?: string[];
  reading_date?: string;
}

export interface OcrFieldResultDto {
  meter_id: string | null;
  meter_code: string;
  label: string | null;
  extracted_value: number | null;
  confidence: number;
  raw_text_seen: string;
  notes: string | null;
  confidence_band: "high" | "low" | "unreadable";
}

export interface OcrExtractResponse {
  photo_id: string | null;
  ocr_status: OcrStatus;
  model: string;
  is_mock: boolean;
  results: OcrFieldResultDto[];
}

export interface SyncPhotoUploadDto {
  local_photo_id: string;
  data_base64: string;
  mime_type: string;
  captured_at: string;
  run_ocr?: boolean;
  group_slug?: string;
  meter_codes?: string[];
}

export interface SyncReadingMutationDto {
  client_mutation_id: string;
  reading_date: string;
  meter_id?: string;
  meter_code: string;
  raw_value: number;
  input_source: InputSource;
  ocr_suggested_value?: number | null;
  ocr_confidence?: number | null;
  is_rollover?: boolean;
  is_meter_replaced?: boolean;
  replacement_baseline?: number | null;
  notes?: string | null;
  local_photo_ids?: string[];
  photo_ids?: string[];
  captured_at?: string;
}

export interface SyncBatchRequest {
  photos?: SyncPhotoUploadDto[];
  mutations: SyncReadingMutationDto[];
}

export interface SyncMutationResultDto {
  client_mutation_id: string;
  reading_id: string;
  meter_code: string;
  reading_date: string;
  status: ReadingStatus;
  is_duplicate_ignored: boolean;
  alerts_triggered: AlertDto[];
  ocr_divergence_flagged?: boolean;
}

export interface SyncBatchResponse {
  synced_photo_map: Record<string, string>;
  results: SyncMutationResultDto[];
  failed: Array<{ client_mutation_id: string; error: string }>;
  server_timestamp: string;
}

export interface SpreadsheetColumnDefDto {
  key: string;
  col_letter_2026: string;
  col_index: number;
  header: string;
  group_slug: string;
  group_name: string;
  kind: SpreadsheetColumnKind;
  meter_id: string | null;
  meter_code: string | null;
  unit: string | null;
  reading_kind: ReadingKind | null;
  sort_order: number;
  editable: boolean;
}

export interface PlanilhaCellDto {
  column_key: string;
  kind: SpreadsheetColumnKind;
  value: number | string | null;
  formatted: string;
  reading_id: string | null;
  meter_id: string | null;
  meter_code: string | null;
  status: ReadingStatus | null;
  alert_severity: AlertSeverity | null;
  is_anomaly: boolean;
  is_multi_day_delta: boolean;
  is_rollover: boolean;
  is_meter_replaced: boolean;
  has_photos: boolean;
  ocr_confidence: number | null;
  input_source: InputSource | null;
}

export interface PlanilhaRowDto {
  reading_date: string;
  cells: Record<string, PlanilhaCellDto>;
  has_pending: boolean;
  highest_alert_severity: AlertSeverity | null;
}

export interface PlanilhaKpisDto {
  reference_date: string | null;
  agua_consumo_geral_m3: number | null;
  energia_consumo_total_kwh: number | null;
  cag_percent_energia: number | null;
  cag_percent_agua: number | null;
  pending_review_count: number;
  active_critical_alerts_count: number;
  active_warning_alerts_count: number;
}

export interface PlanilhaResponse {
  columns: SpreadsheetColumnDefDto[];
  rows: PlanilhaRowDto[];
  kpis: PlanilhaKpisDto;
  available_years: number[];
  total_rows: number;
}

export interface ReadingAuditLogDto {
  id: string;
  reading_id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: AuditAction;
  previous_value: number | null;
  new_value: number | null;
  reason: string | null;
  created_at: string;
}

export interface ReadingPhotoDto {
  id: string;
  storage_path: string;
  signed_url: string;
  captured_at: string;
  ocr_status: OcrStatus;
  ocr_raw_response: unknown;
}

export interface ReadingDetailResponse {
  reading: CampoTodayReadingDto & {
    created_by: string | null;
    created_by_name: string | null;
    reviewed_by: string | null;
    reviewed_by_name: string | null;
    reviewed_at: string | null;
  };
  meter: MeterDto;
  previous_reading: PreviousReadingRefDto | null;
  photos: ReadingPhotoDto[];
  audit_logs: ReadingAuditLogDto[];
  alerts: AlertDto[];
}

export interface ReviewReadingRequest {
  reading_id: string;
  action: "approve" | "flag";
  reason?: string;
}

export interface ReviewReadingResponse {
  reading_id: string;
  status: ReadingStatus;
  reviewed_by: string;
  reviewed_at: string;
  audit_log: ReadingAuditLogDto;
}

export interface CorrectReadingRequest {
  reading_id?: string;
  reading_date?: string;
  meter_code?: string;
  new_value?: number;
  raw_value?: number;
  reason?: string;
  is_rollover?: boolean;
  is_meter_replaced?: boolean;
  replacement_baseline?: number | null;
}

export interface CorrectReadingResponse {
  reading_id: string;
  meter_code: string;
  reading_date: string;
  previous_value: number | null;
  new_value: number;
  status: ReadingStatus;
  audit_log: ReadingAuditLogDto;
  alerts_triggered: AlertDto[];
}

export interface CatalogResponse {
  groups: MeterGroupDto[];
  meters: MeterDto[];
  users?: AuthUserProfile[];
}

export interface CatalogUpdateRequest {
  group_updates?: Array<{
    id: string;
    name?: string;
    display_order?: number;
    is_active_in_field?: boolean;
    allow_batch_photo?: boolean;
  }>;
  meter_updates?: Array<{
    id: string;
    label?: string;
    unit?: string | null;
    multiplier_factor?: number;
    dial_capacity?: number | null;
    photo_required?: boolean;
    is_active_in_field?: boolean;
    is_active_in_sheet?: boolean;
    sort_order?: number;
    ocr_hint?: string | null;
  }>;
  threshold_updates?: Array<{
    meter_id: string;
    warning_min?: number | null;
    critical_min?: number | null;
    teto_value?: number | null;
  }>;
  new_meter?: {
    group_id: string;
    code: string;
    excel_header: string;
    label: string;
    unit?: string | null;
    reading_kind: ReadingKind;
    multiplier_factor?: number;
    dial_capacity?: number | null;
    photo_required?: boolean;
    is_active_in_field?: boolean;
    is_active_in_sheet?: boolean;
    sort_order?: number;
    ocr_hint?: string | null;
  };
  user_updates?: Array<{
    id: string;
    role?: UserRole;
    active?: boolean;
    full_name?: string;
    restrict_groups?: boolean;
    allowed_group_ids?: string[];
  }>;
  new_user?: {
    email: string;
    password: string;
    full_name: string;
    role: UserRole;
    restrict_groups?: boolean;
    allowed_group_ids?: string[];
  };
}

export interface AlertsListResponse {
  alerts: AlertDto[];
  counts: {
    critical: number;
    warning: number;
    unacknowledged: number;
  };
}

export interface AcknowledgeAlertRequest {
  alert_id: string;
  acknowledge: boolean;
}

export interface ImportXlsxResponse {
  dry_run: boolean;
  sheets_processed: string[];
  total_rows_read: number;
  total_readings_imported: number;
  rollovers_detected: number;
  skipped_cells: number;
  warnings: string[];
}

export interface PushConfigResponse {
  vapid_public_key: string | null;
  subscribed: boolean;
}

export interface PushSubscribeRequest {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: unknown;
}

export interface DashboardMonthlyPointDto {
  month: number;
  label: string;
  agua_geral_m3: number;
  agua_geral_prev_m3: number;
  agua_reuso_m3: number;
  agua_muro_verde_m3: number;
  agua_calcadao_m3: number;
  energia_total_kwh: number;
  energia_total_prev_kwh: number;
  bss1_kwh: number;
  bss2_kwh: number;
  bss3_kwh: number;
  bss4_kwh: number;
  cag_energia_kwh: number;
  cag_energia_prev_kwh: number;
  cag_agua_m3: number;
  cag_agua_prev_m3: number;
  cag_condutivimetro_avg: number | null;
  temp_externa_avg: number | null;
  temp_jockey_avg: number | null;
  temp_guaiba_avg: number | null;
  chiller1_motor_avg: number | null;
  chiller2_motor_avg: number | null;
}

export interface DashboardAnnualPointDto {
  year: number;
  agua_geral_m3: number;
  agua_reuso_m3: number;
  agua_muro_verde_m3: number;
  agua_calcadao_m3: number;
  energia_total_kwh: number;
  bss1_kwh: number;
  bss2_kwh: number;
  bss3_kwh: number;
  bss4_kwh: number;
  cag_energia_kwh: number;
  cag_agua_m3: number;
  temp_externa_avg: number | null;
  temp_jockey_avg: number | null;
  temp_guaiba_avg: number | null;
}

export interface DashboardSectorShareDto {
  key: string;
  label: string;
  value: number;
  unit: string;
  color: string;
}

export interface DashboardResponse {
  available_years: number[];
  selected_year: number;
  previous_year: number;
  kpis: {
    agua_geral_m3: number;
    agua_geral_yoy_pct: number | null;
    energia_total_kwh: number;
    energia_total_yoy_pct: number | null;
    cag_energia_kwh: number;
    cag_energia_yoy_pct: number | null;
    cag_agua_m3: number;
    cag_agua_yoy_pct: number | null;
    temp_externa_avg: number | null;
    temp_jockey_avg: number | null;
    temp_guaiba_avg: number | null;
    unacknowledged_alerts: number;
    critical_alerts: number;
  };
  monthly_series: DashboardMonthlyPointDto[];
  annual_series: DashboardAnnualPointDto[];
  energy_sector_shares: DashboardSectorShareDto[];
  water_sector_shares: DashboardSectorShareDto[];
}
