import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type {
  AlertDto,
  AuthUserProfile,
  MeterDto,
  MeterGroupDto,
  OcrStatus,
  ReadingAuditLogDto,
  ReadingStatus,
  InputSource,
} from "@/types/contracts";
import { LOCAL_USERS } from "./auth";
import { INITIAL_LOCAL_GROUPS, INITIAL_LOCAL_METERS } from "./local-catalog";

export interface LocalPhotoRecord {
  id: string;
  storage_path: string;
  data_url: string;
  captured_at: string;
  uploaded_by: string | null;
  ocr_raw_response: unknown;
  ocr_status: OcrStatus;
}

export interface LocalReadingRecord {
  id: string;
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
  status: ReadingStatus;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  client_mutation_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LocalPushSubscriptionRecord {
  id: string;
  user_id: string;
  endpoint: string;
  keys_json: {
    p256dh: string;
    auth: string;
  };
  created_at: string;
}

export interface LocalDatabaseState {
  users: AuthUserProfile[];
  groups: MeterGroupDto[];
  meters: MeterDto[];
  readings: LocalReadingRecord[];
  photos: LocalPhotoRecord[];
  readingPhotos: Array<{ reading_id: string; photo_id: string }>;
  auditLogs: ReadingAuditLogDto[];
  alerts: AlertDto[];
  pushSubscriptions: LocalPushSubscriptionRecord[];
}

const DB_DIR = path.join(process.cwd(), ".local-data");
const DB_FILE = path.join(DB_DIR, "medicoes-db.json");

function createInitialSeedData(): LocalDatabaseState {
  const meters = structuredClone(INITIAL_LOCAL_METERS);
  const meterByCode = new Map(meters.map((m) => [m.code, m]));

  const readings: LocalReadingRecord[] = [];
  const auditLogs: ReadingAuditLogDto[] = [];
  const alerts: AlertDto[] = [];

  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const seedDays: Array<{
    date: string;
    values: Record<string, { val: number; rollover?: boolean; status?: ReadingStatus }>;
  }> = [
    {
      date: "2025-09-18",
      values: {
        agua_hidrometro_geral: { val: 240120 },
        agua_reuso: { val: 9999 },
        agua_muro_verde: { val: 1200 },
        agua_irrigacao_calcadao: { val: 410 },
        agua_horas_carregamento: { val: 3 },
        bss1_consumo_fp: { val: 12400 },
        bss1_consumo_p: { val: 2100 },
        bss2_consumo_fp: { val: 3200 },
        bss2_consumo_p: { val: 480 },
        bss3_consumo_fp: { val: 1500 },
        bss3_consumo_p: { val: 240 },
        bss4_consumo_fp: { val: 2100 },
        bss4_consumo_p: { val: 350 },
        cag_medidor_kwh: { val: 1410 },
        cag_medidor_m3: { val: 8510 },
        cag_dreno_torre: { val: 310 },
        cag_ladrao_torre: { val: 12 },
        cag_condutivimetro: { val: 580 },
      },
    },
    {
      date: "2025-09-19",
      values: {
        agua_hidrometro_geral: { val: 240345 },
        agua_reuso: { val: 4, rollover: true },
        agua_muro_verde: { val: 1204 },
        agua_irrigacao_calcadao: { val: 415 },
        agua_horas_carregamento: { val: 4 },
        bss1_consumo_fp: { val: 12650 },
        bss1_consumo_p: { val: 2180 },
        bss2_consumo_fp: { val: 3250 },
        bss2_consumo_p: { val: 495 },
        bss3_consumo_fp: { val: 1510 },
        bss3_consumo_p: { val: 250 },
        bss4_consumo_fp: { val: 2130 },
        bss4_consumo_p: { val: 360 },
        cag_medidor_kwh: { val: 1414.2 },
        cag_medidor_m3: { val: 8545 },
        cag_dreno_torre: { val: 318 },
        cag_ladrao_torre: { val: 12 },
        cag_condutivimetro: { val: 610 },
      },
    },
    {
      date: "2025-12-31",
      values: {
        agua_hidrometro_geral: { val: 243120 },
        agua_reuso: { val: 412 },
        agua_muro_verde: { val: 1450 },
        agua_irrigacao_calcadao: { val: 520 },
        agua_horas_carregamento: { val: 4 },
        temp_externa: { val: 29.5 },
        temp_jockey_01_gt_renner: { val: 23.1 },
        temp_jockey_02_opasta: { val: 23.4 },
        temp_guaiba_08_gt_renner: { val: 22.8 },
        bss1_consumo_fp: { val: 13100 },
        bss1_consumo_p: { val: 2240 },
        bss1_demanda_fp: { val: 2310 },
        bss1_demanda_p: { val: 2150 },
        bss2_consumo_fp: { val: 3340 },
        bss2_consumo_p: { val: 510 },
        bss2_demanda_fp: { val: 410 },
        bss2_demanda_p: { val: 390 },
        bss3_consumo_fp: { val: 1580 },
        bss3_consumo_p: { val: 260 },
        bss3_demanda_fp: { val: 165 },
        bss3_demanda_p: { val: 155 },
        bss4_consumo_fp: { val: 2190 },
        bss4_consumo_p: { val: 370 },
        bss4_demanda_fp: { val: 280 },
        bss4_demanda_p: { val: 270 },
        cag_medidor_kwh: { val: 1620 },
        cag_medidor_m3: { val: 9240 },
        cag_dreno_torre: { val: 410 },
        cag_ladrao_torre: { val: 14 },
        cag_condutivimetro: { val: 640 },
      },
    },
    {
      date: "2026-01-01",
      values: {
        agua_hidrometro_geral: { val: 243338 },
        agua_reuso: { val: 425 },
        agua_muro_verde: { val: 1455 },
        agua_irrigacao_calcadao: { val: 524 },
        agua_horas_carregamento: { val: 4 },
        temp_externa: { val: 28.0 },
        temp_jockey_01_gt_renner: { val: 22.9 },
        temp_jockey_02_opasta: { val: 23.2 },
        temp_guaiba_08_gt_renner: { val: 22.6 },
        bss1_consumo_fp: { val: 12900 },
        bss1_consumo_p: { val: 0 },
        bss1_demanda_fp: { val: 2280 },
        bss1_demanda_p: { val: 1980 },
        bss2_consumo_fp: { val: 3290 },
        bss2_consumo_p: { val: 0 },
        bss2_demanda_fp: { val: 400 },
        bss2_demanda_p: { val: 370 },
        bss3_consumo_fp: { val: 1540 },
        bss3_consumo_p: { val: 0 },
        bss3_demanda_fp: { val: 160 },
        bss3_demanda_p: { val: 150 },
        bss4_consumo_fp: { val: 2140 },
        bss4_consumo_p: { val: 0 },
        bss4_demanda_fp: { val: 275 },
        bss4_demanda_p: { val: 260 },
        cag_medidor_kwh: { val: 1624.5 },
        cag_medidor_m3: { val: 9278 },
        cag_dreno_torre: { val: 416 },
        cag_ladrao_torre: { val: 14 },
        cag_condutivimetro: { val: 655 },
      },
    },
  ];

  const yesterdayStr = fmt(yesterday);
  if (
    yesterdayStr !== "2026-01-01" &&
    yesterdayStr !== "2025-12-31" &&
    yesterdayStr !== "2025-09-19"
  ) {
    seedDays.push({
      date: yesterdayStr,
      values: {
        agua_hidrometro_geral: { val: 251400 },
        agua_reuso: { val: 1240 },
        agua_muro_verde: { val: 1680 },
        agua_irrigacao_calcadao: { val: 630 },
        agua_horas_carregamento: { val: 4 },
        temp_externa: { val: 26.5 },
        temp_jockey_01_gt_renner: { val: 23.0 },
        temp_guaiba_08_gt_renner: { val: 22.5 },
        bss1_consumo_fp: { val: 13200 },
        bss1_consumo_p: { val: 2290 },
        bss1_demanda_fp: { val: 2410 },
        bss1_demanda_p: { val: 2190 },
        bss2_consumo_fp: { val: 3410 },
        bss2_consumo_p: { val: 520 },
        bss2_demanda_fp: { val: 430 },
        bss2_demanda_p: { val: 410 },
        bss3_consumo_fp: { val: 1610 },
        bss3_consumo_p: { val: 265 },
        bss3_demanda_fp: { val: 170 },
        bss3_demanda_p: { val: 162 },
        bss4_consumo_fp: { val: 2240 },
        bss4_consumo_p: { val: 380 },
        bss4_demanda_fp: { val: 290 },
        bss4_demanda_p: { val: 280 },
        cag_medidor_kwh: { val: 1840 },
        cag_medidor_m3: { val: 10120 },
        cag_dreno_torre: { val: 492 },
        cag_ladrao_torre: { val: 16 },
        cag_condutivimetro: { val: 685, status: "pending_review" },
      },
    });
  }

  for (const day of seedDays) {
    for (const [code, spec] of Object.entries(day.values)) {
      const meter = meterByCode.get(code);
      if (!meter) continue;
      const readingId = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      readings.push({
        id: readingId,
        reading_date: day.date,
        meter_id: meter.id,
        meter_code: meter.code,
        raw_value: spec.val,
        input_source: "xlsx_import",
        ocr_suggested_value: null,
        ocr_confidence: null,
        is_rollover: Boolean(spec.rollover),
        is_meter_replaced: false,
        replacement_baseline: null,
        notes: spec.rollover ? "Virada histórica de 4 dígitos" : null,
        status: spec.status ?? "approved",
        created_by: LOCAL_USERS.manager.id,
        reviewed_by:
          (spec.status ?? "approved") === "approved"
            ? LOCAL_USERS.manager.id
            : null,
        reviewed_at:
          (spec.status ?? "approved") === "approved" ? nowIso : null,
        client_mutation_id: null,
        created_at: nowIso,
        updated_at: nowIso,
      });

      auditLogs.push({
        id: crypto.randomUUID(),
        reading_id: readingId,
        actor_id: LOCAL_USERS.manager.id,
        actor_name: LOCAL_USERS.manager.full_name,
        action: "import",
        previous_value: null,
        new_value: spec.val,
        reason: "Carga inicial local",
        created_at: nowIso,
      });
    }
  }

  return {
    users: [
      structuredClone(LOCAL_USERS.technician),
      structuredClone(LOCAL_USERS.manager),
    ],
    groups: structuredClone(INITIAL_LOCAL_GROUPS),
    meters,
    readings,
    photos: [],
    readingPhotos: [],
    auditLogs,
    alerts,
    pushSubscriptions: [],
  };
}

const globalForDb = globalThis as unknown as {
  __medicoesLocalDb?: LocalDatabaseState;
};

export function getLocalDb(): LocalDatabaseState {
  if (globalForDb.__medicoesLocalDb) {
    return globalForDb.__medicoesLocalDb;
  }

  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, "utf8");
      const parsed = JSON.parse(raw) as LocalDatabaseState;
      globalForDb.__medicoesLocalDb = parsed;
      return parsed;
    }
  } catch {
    // Fallback to fresh seed if file is corrupt
  }

  const seeded = createInitialSeedData();
  globalForDb.__medicoesLocalDb = seeded;
  saveLocalDb(seeded);
  return seeded;
}

export function saveLocalDb(state?: LocalDatabaseState): void {
  const target = state ?? globalForDb.__medicoesLocalDb;
  if (!target) return;
  globalForDb.__medicoesLocalDb = target;
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(target, null, 2), "utf8");
  } catch {
    // Non-fatal in read-only edge/test sandboxes
  }
}

export function resetLocalDbForTests(): LocalDatabaseState {
  const seeded = createInitialSeedData();
  globalForDb.__medicoesLocalDb = seeded;
  saveLocalDb(seeded);
  return seeded;
}
