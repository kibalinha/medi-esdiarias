// Tipagem TypeScript fiel ao esquema PostgreSQL/Supabase (0001_initial_schema.sql)

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'technician' | 'manager';
export type ReadingStatus = 'pending_review' | 'approved' | 'flagged';
export type AlertSeverity = 'warning' | 'critical';

export type ReadingKind =
  | 'cumulative'
  | 'instant'
  | 'temperature'
  | 'hours'
  | 'quality';

export type InputSource = 'ocr' | 'manual' | 'ocr_edited' | 'xlsx_import';
export type OcrStatus = 'pending' | 'processed' | 'failed' | 'skipped';
export type AuditAction = 'create' | 'update_value' | 'approve' | 'flag' | 'import';

export type MeterGroupSlug =
  | 'agua'
  | 'temp_externa'
  | 'temp_jockey'
  | 'temp_guaiba'
  | 'bss_1'
  | 'bss_2'
  | 'bss_3'
  | 'bss_4'
  | 'chiller_1'
  | 'chiller_2'
  | 'cag'
  | (string & {});

export type AlertRuleCode =
  | 'CONDUTIVIMETRO_ALTO'
  | 'CONDUTIVIMETRO_CRITICO'
  | 'DEMANDA_ATENCAO'
  | 'DEMANDA_TETO'
  | 'QUEDA_MEDIDOR'
  | 'CAG_AGUA_ANOMALIA'
  | (string & {});

export type ProfileRow = {
  id: string;
  full_name: string;
  role: UserRole;
  active: boolean;
  restrict_groups: boolean;
  created_at: string;
  updated_at: string;
};

export type UserMeterGroupRow = {
  user_id: string;
  group_id: string;
  created_at: string;
};

export type MeterGroupRow = {
  id: string;
  slug: MeterGroupSlug;
  name: string;
  display_order: number;
  is_active_in_field: boolean;
  allow_batch_photo: boolean;
  created_at: string;
  updated_at: string;
};

export type MeterRow = {
  id: string;
  group_id: string;
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
  created_at: string;
  updated_at: string;
};

export type MeterThresholdRow = {
  id: string;
  meter_id: string;
  warning_min: number | null;
  critical_min: number | null;
  teto_value: number | null;
  effective_from: string;
  updated_by: string | null;
  updated_at: string;
};

export type FieldPhotoRow = {
  id: string;
  storage_path: string;
  captured_at: string;
  uploaded_by: string | null;
  ocr_raw_response: Json | null;
  ocr_status: OcrStatus;
};

export type MeterReadingRow = {
  id: string;
  reading_date: string;
  meter_id: string;
  raw_value: number;
  input_source: InputSource;
  ocr_suggested_value: number | null;
  ocr_confidence: number | null;
  is_rollover: boolean;
  is_meter_replaced: boolean;
  replacement_baseline: number | null;
  notes: string | null;
  status: ReadingStatus;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  client_mutation_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ReadingPhotoRow = {
  reading_id: string;
  photo_id: string;
};

export type ReadingAuditLogRow = {
  id: string;
  reading_id: string;
  actor_id: string | null;
  action: AuditAction;
  previous_value: number | null;
  new_value: number | null;
  reason: string | null;
  created_at: string;
};

export type AlertRow = {
  id: string;
  reading_id: string | null;
  reading_date: string;
  meter_id: string;
  severity: AlertSeverity;
  rule_code: AlertRuleCode;
  message: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  notified_email: boolean;
  notified_push: boolean;
  created_at: string;
};

export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  keys_json: Json;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: {
          id: string;
          full_name: string;
          role?: UserRole;
          active?: boolean;
          restrict_groups?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          role?: UserRole;
          active?: boolean;
          restrict_groups?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_meter_groups: {
        Row: UserMeterGroupRow;
        Insert: {
          user_id: string;
          group_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          group_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      meter_groups: {
        Row: MeterGroupRow;
        Insert: {
          id?: string;
          slug: string;
          name: string;
          display_order: number;
          is_active_in_field?: boolean;
          allow_batch_photo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          display_order?: number;
          is_active_in_field?: boolean;
          allow_batch_photo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      meters: {
        Row: MeterRow;
        Insert: {
          id?: string;
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
          sort_order: number;
          ocr_hint?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          code?: string;
          excel_header?: string;
          label?: string;
          unit?: string | null;
          reading_kind?: ReadingKind;
          multiplier_factor?: number;
          dial_capacity?: number | null;
          photo_required?: boolean;
          is_active_in_field?: boolean;
          is_active_in_sheet?: boolean;
          sort_order?: number;
          ocr_hint?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meters_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'meter_groups';
            referencedColumns: ['id'];
          },
        ];
      };
      meter_thresholds: {
        Row: MeterThresholdRow;
        Insert: {
          id?: string;
          meter_id: string;
          warning_min?: number | null;
          critical_min?: number | null;
          teto_value?: number | null;
          effective_from?: string;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          meter_id?: string;
          warning_min?: number | null;
          critical_min?: number | null;
          teto_value?: number | null;
          effective_from?: string;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meter_thresholds_meter_id_fkey';
            columns: ['meter_id'];
            isOneToOne: false;
            referencedRelation: 'meters';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meter_thresholds_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      field_photos: {
        Row: FieldPhotoRow;
        Insert: {
          id?: string;
          storage_path: string;
          captured_at?: string;
          uploaded_by?: string | null;
          ocr_raw_response?: Json | null;
          ocr_status?: OcrStatus;
        };
        Update: {
          id?: string;
          storage_path?: string;
          captured_at?: string;
          uploaded_by?: string | null;
          ocr_raw_response?: Json | null;
          ocr_status?: OcrStatus;
        };
        Relationships: [
          {
            foreignKeyName: 'field_photos_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      meter_readings: {
        Row: MeterReadingRow;
        Insert: {
          id?: string;
          reading_date: string;
          meter_id: string;
          raw_value: number;
          input_source?: InputSource;
          ocr_suggested_value?: number | null;
          ocr_confidence?: number | null;
          is_rollover?: boolean;
          is_meter_replaced?: boolean;
          replacement_baseline?: number | null;
          notes?: string | null;
          status?: ReadingStatus;
          created_by?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          client_mutation_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          reading_date?: string;
          meter_id?: string;
          raw_value?: number;
          input_source?: InputSource;
          ocr_suggested_value?: number | null;
          ocr_confidence?: number | null;
          is_rollover?: boolean;
          is_meter_replaced?: boolean;
          replacement_baseline?: number | null;
          notes?: string | null;
          status?: ReadingStatus;
          created_by?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          client_mutation_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meter_readings_meter_id_fkey';
            columns: ['meter_id'];
            isOneToOne: false;
            referencedRelation: 'meters';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meter_readings_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meter_readings_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      reading_photos: {
        Row: ReadingPhotoRow;
        Insert: {
          reading_id: string;
          photo_id: string;
        };
        Update: {
          reading_id?: string;
          photo_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reading_photos_reading_id_fkey';
            columns: ['reading_id'];
            isOneToOne: false;
            referencedRelation: 'meter_readings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reading_photos_photo_id_fkey';
            columns: ['photo_id'];
            isOneToOne: false;
            referencedRelation: 'field_photos';
            referencedColumns: ['id'];
          },
        ];
      };
      reading_audit_logs: {
        Row: ReadingAuditLogRow;
        Insert: {
          id?: string;
          reading_id: string;
          actor_id?: string | null;
          action: AuditAction;
          previous_value?: number | null;
          new_value?: number | null;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          reading_id?: string;
          actor_id?: string | null;
          action?: AuditAction;
          previous_value?: number | null;
          new_value?: number | null;
          reason?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reading_audit_logs_reading_id_fkey';
            columns: ['reading_id'];
            isOneToOne: false;
            referencedRelation: 'meter_readings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reading_audit_logs_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      alerts: {
        Row: AlertRow;
        Insert: {
          id?: string;
          reading_id?: string | null;
          reading_date: string;
          meter_id: string;
          severity: AlertSeverity;
          rule_code: AlertRuleCode;
          message: string;
          acknowledged_by?: string | null;
          acknowledged_at?: string | null;
          notified_email?: boolean;
          notified_push?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          reading_id?: string | null;
          reading_date?: string;
          meter_id?: string;
          severity?: AlertSeverity;
          rule_code?: AlertRuleCode;
          message?: string;
          acknowledged_by?: string | null;
          acknowledged_at?: string | null;
          notified_email?: boolean;
          notified_push?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'alerts_reading_id_fkey';
            columns: ['reading_id'];
            isOneToOne: false;
            referencedRelation: 'meter_readings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'alerts_meter_id_fkey';
            columns: ['meter_id'];
            isOneToOne: false;
            referencedRelation: 'meters';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'alerts_acknowledged_by_fkey';
            columns: ['acknowledged_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      push_subscriptions: {
        Row: PushSubscriptionRow;
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          keys_json: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          endpoint?: string;
          keys_json?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_subscriptions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_user_role: {
        Args: Record<string, never>;
        Returns: UserRole | null;
      };
      is_active_user: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_manager: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: {
      user_role: UserRole;
      reading_status: ReadingStatus;
      alert_severity: AlertSeverity;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
