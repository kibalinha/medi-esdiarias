import crypto from "node:crypto";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import { getDataMode } from "@/lib/supabase/config";
import { getLocalDb, saveLocalDb } from "@/lib/supabase/local-store";
import { getCatalogData } from "@/lib/supabase/repository";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { ImportXlsxResponse } from "@/types/contracts";

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function parseCellDate(val: ExcelJS.CellValue): string | null {
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  if (typeof val === "object" && val !== null && "result" in val) {
    return parseCellDate((val as { result: ExcelJS.CellValue }).result);
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  }
  return null;
}

function parseNumericCell(val: ExcelJS.CellValue): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") {
    return Number.isFinite(val) ? val : null;
  }
  if (typeof val === "object" && val !== null) {
    // Ignore formulas or error objects like #REF!
    if ("formula" in val || "sharedFormula" in val || "error" in val) {
      return null;
    }
    if ("result" in val) {
      return parseNumericCell((val as { result: ExcelJS.CellValue }).result);
    }
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed === "-") return null;
    const n = Number(trimmed.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function POST(req: Request) {
  const auth = await requireAuth(req, "manager");
  if (auth.errorResponse) return auth.errorResponse;

  try {
    let buffer: Buffer;
    let dryRun = false;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "Campo file obrigatório no multipart/form-data." },
          { status: 400 },
        );
      }
      buffer = Buffer.from(await file.arrayBuffer());
      dryRun = String(formData.get("dry_run") || "false") === "true";
    } else {
      const json = (await req.json()) as {
        file_base64?: string;
        dry_run?: boolean;
      };
      if (!json.file_base64) {
        return NextResponse.json(
          { error: "file_base64 obrigatório." },
          { status: 400 },
        );
      }
      const clean = json.file_base64.replace(/^data:[^;]+;base64,/, "");
      buffer = Buffer.from(clean, "base64");
      dryRun = Boolean(json.dry_run);
    }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);

    const catalog = await getCatalogData();
    const meterByNormHeader = new Map(
      catalog.meters.map((m) => [normalizeHeader(m.excel_header), m]),
    );

    const sheetsProcessed: string[] = [];
    const warnings: string[] = [];
    let totalRowsRead = 0;
    let skippedCells = 0;
    let rolloversDetected = 0;

    interface ImportedReadingItem {
      reading_date: string;
      meter_id: string;
      meter_code: string;
      raw_value: number;
      is_rollover: boolean;
    }
    const toImport: ImportedReadingItem[] = [];
    const lastValueByMeterCode = new Map<string, number>();

    for (const sheet of wb.worksheets) {
      if (!/^(202\d)$/.test(sheet.name.trim())) {
        continue;
      }
      sheetsProcessed.push(sheet.name.trim());
      const headerRow = sheet.getRow(1);
      const colToMeter = new Map<number, (typeof catalog.meters)[number]>();

      for (let c = 2; c <= sheet.columnCount; c += 1) {
        const rawH = String(headerRow.getCell(c).value ?? "").trim();
        if (!rawH) continue;
        const matched = meterByNormHeader.get(normalizeHeader(rawH));
        if (matched) {
          colToMeter.set(c, matched);
        }
      }

      for (let r = 2; r <= sheet.rowCount; r += 1) {
        const row = sheet.getRow(r);
        const dateStr = parseCellDate(row.getCell(1).value);
        if (!dateStr) continue;
        totalRowsRead += 1;

        for (const [colIdx, meter] of colToMeter.entries()) {
          const cell = row.getCell(colIdx);
          const num = parseNumericCell(cell.value);
          if (num === null) {
            if (cell.value !== null && cell.value !== undefined && cell.value !== "") {
              skippedCells += 1;
            }
            continue;
          }

          let isRollover = false;
          if (meter.reading_kind === "cumulative") {
            const prev = lastValueByMeterCode.get(meter.code);
            if (prev !== undefined && num < prev) {
              isRollover = true;
              rolloversDetected += 1;
              warnings.push(
                `${dateStr} [${meter.code}]: queda ${prev} -> ${num} marcada como rollover.`,
              );
            }
            lastValueByMeterCode.set(meter.code, num);
          }

          toImport.push({
            reading_date: dateStr,
            meter_id: meter.id,
            meter_code: meter.code,
            raw_value: num,
            is_rollover: isRollover,
          });
        }
      }
    }

    if (!dryRun && toImport.length > 0) {
      const nowIso = new Date().toISOString();
      if (getDataMode() === "local") {
        const db = getLocalDb();
        const existingMap = new Map(
          db.readings.map((r) => [`${r.reading_date}::${r.meter_id}`, r]),
        );
        for (const item of toImport) {
          const key = `${item.reading_date}::${item.meter_id}`;
          const existing = existingMap.get(key);
          if (existing) {
            existing.raw_value = item.raw_value;
            existing.is_rollover = item.is_rollover;
            existing.input_source = "xlsx_import";
            existing.status = "approved";
            existing.updated_at = nowIso;
          } else {
            const id = crypto.randomUUID();
            const rec = {
              id,
              reading_date: item.reading_date,
              meter_id: item.meter_id,
              meter_code: item.meter_code,
              raw_value: item.raw_value,
              input_source: "xlsx_import" as const,
              ocr_suggested_value: null,
              ocr_confidence: null,
              is_rollover: item.is_rollover,
              is_meter_replaced: false,
              replacement_baseline: null,
              notes: item.is_rollover ? "Rollover histórico importado" : null,
              status: "approved" as const,
              created_by: auth.user.id,
              reviewed_by: auth.user.id,
              reviewed_at: nowIso,
              client_mutation_id: null,
              created_at: nowIso,
              updated_at: nowIso,
            };
            db.readings.push(rec);
            existingMap.set(key, rec);
          }
        }
        saveLocalDb(db);
      } else {
        const admin = createSupabaseAdminClient();
        if (!admin) {
          throw new Error("SUPABASE_SERVICE_ROLE_KEY necessária para importação.");
        }
        const batchSize = 500;
        for (let i = 0; i < toImport.length; i += batchSize) {
          const slice = toImport.slice(i, i + batchSize).map((item) => ({
            reading_date: item.reading_date,
            meter_id: item.meter_id,
            raw_value: item.raw_value,
            input_source: "xlsx_import" as const,
            is_rollover: item.is_rollover,
            status: "approved" as const,
            created_by: auth.user.id,
            reviewed_by: auth.user.id,
            reviewed_at: nowIso,
          }));
          const { error } = await admin
            .from("meter_readings")
            .upsert(slice, { onConflict: "reading_date,meter_id" });
          if (error) throw new Error(error.message);
        }
      }
    }

    const body: ImportXlsxResponse = {
      dry_run: dryRun,
      sheets_processed: sheetsProcessed,
      total_rows_read: totalRowsRead,
      total_readings_imported: toImport.length,
      rollovers_detected: rolloversDetected,
      skipped_cells: skippedCells,
      warnings: warnings.slice(0, 50),
    };

    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Erro ao importar XLSX.",
      },
      { status: 500 },
    );
  }
}
