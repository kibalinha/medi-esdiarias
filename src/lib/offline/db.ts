import Dexie, { type Table } from "dexie";
import type {
  AlertDto,
  AuthUserProfile,
  CampoBootstrapResponse,
  CampoTodayReadingDto,
  InputSource,
  MeterDto,
  MeterGroupDto,
  OcrStatus,
  PreviousReadingRefDto,
  ReadingStatus,
} from "@/types/contracts";

export interface CatalogCacheRecord {
  id: string; // e.g. "current" or date-specific "bootstrap:YYYY-MM-DD"
  date: string;
  user: AuthUserProfile;
  groups: MeterGroupDto[];
  meters: MeterDto[];
  previous_readings: Record<string, PreviousReadingRefDto>;
  existing_readings_today: Record<string, CampoTodayReadingDto>;
  active_alerts: AlertDto[];
  updated_at: string;
}

export interface PendingPhotoRecord {
  local_photo_id: string; // UUID v4
  blob: Blob;
  data_base64: string;
  mime_type: "image/webp" | "image/jpeg" | "image/png";
  size_bytes: number;
  captured_at: string;
  group_slug: string;
  meter_codes: string[];
  ocr_status: OcrStatus;
  remote_photo_id: string | null;
  uploaded: boolean;
}

export type SyncQueueItemStatus = "pending" | "syncing" | "failed";

export interface SyncQueueRecord {
  client_mutation_id: string; // UUID v4
  reading_date: string;
  meter_id: string;
  meter_code: string;
  raw_value: number;
  input_source: InputSource;
  ocr_suggested_value: number | null;
  ocr_confidence: number | null;
  is_rollover: boolean;
  is_meter_replaced: boolean;
  replacement_baseline: number | null;
  notes: string | null;
  local_photo_ids: string[];
  photo_ids: string[];
  captured_at: string;
  status: SyncQueueItemStatus;
  retry_count: number;
  error_message: string | null;
  created_at: string;
}

export interface DraftReadingRecord {
  key: string; // `${reading_date}:${meter_code}`
  reading_date: string;
  meter_id: string;
  meter_code: string;
  raw_value: number;
  input_source: InputSource;
  ocr_suggested_value: number | null;
  ocr_confidence: number | null;
  is_rollover: boolean;
  is_meter_replaced: boolean;
  replacement_baseline: number | null;
  notes: string | null;
  local_photo_ids: string[];
  photo_ids: string[];
  sync_state: "local_only" | "queued" | "synced" | "error";
  server_reading_id: string | null;
  server_status: ReadingStatus | null;
  updated_at: string;
}

export class MedicoesOfflineDB extends Dexie {
  catalogCache!: Table<CatalogCacheRecord, string>;
  pendingPhotos!: Table<PendingPhotoRecord, string>;
  syncQueue!: Table<SyncQueueRecord, string>;
  draftReadings!: Table<DraftReadingRecord, string>;

  constructor() {
    super("medicoes_offline_db");
    this.version(1).stores({
      catalogCache: "id, date, updated_at",
      pendingPhotos: "local_photo_id, captured_at, uploaded, group_slug",
      syncQueue: "client_mutation_id, reading_date, meter_code, status, created_at",
      draftReadings: "key, reading_date, meter_code, sync_state, updated_at",
    });
  }
}

let dbInstance: MedicoesOfflineDB | null = null;

export function getOfflineDb(): MedicoesOfflineDB {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB só está disponível no navegador.");
  }
  if (!dbInstance) {
    dbInstance = new MedicoesOfflineDB();
  }
  return dbInstance;
}

export async function saveBootstrapCache(
  payload: CampoBootstrapResponse,
): Promise<void> {
  const db = getOfflineDb();
  const now = new Date().toISOString();
  await db.catalogCache.put({
    id: "current",
    date: payload.date,
    user: payload.user,
    groups: payload.groups,
    meters: payload.meters,
    previous_readings: payload.previous_readings,
    existing_readings_today: payload.existing_readings_today,
    active_alerts: payload.active_alerts,
    updated_at: now,
  });
  await db.catalogCache.put({
    id: `date:${payload.date}`,
    date: payload.date,
    user: payload.user,
    groups: payload.groups,
    meters: payload.meters,
    previous_readings: payload.previous_readings,
    existing_readings_today: payload.existing_readings_today,
    active_alerts: payload.active_alerts,
    updated_at: now,
  });
}

export async function loadBootstrapCache(
  date?: string,
): Promise<CatalogCacheRecord | null> {
  const db = getOfflineDb();
  if (date) {
    const byDate = await db.catalogCache.get(`date:${date}`);
    if (byDate) return byDate;
  }
  const current = await db.catalogCache.get("current");
  return current ?? null;
}

export function generateClientUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback RFC4122 v4
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
