import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_COLUMNS_2026,
  buildSpreadsheetColumns,
  exportSpreadsheetToCsv,
  exportSpreadsheetToXlsxBuffer,
  projectNormalizedToSpreadsheet,
  type NormalizedReadingRecord,
} from "@/domain/spreadsheet";
import { INITIAL_LOCAL_METERS } from "@/lib/supabase/local-catalog";

function mkReading(
  date: string,
  code: string,
  val: number,
  opts: Partial<NormalizedReadingRecord> = {},
): NormalizedReadingRecord {
  const meter = INITIAL_LOCAL_METERS.find((m) => m.code === code);
  if (!meter) throw new Error(`Unknown meter code in test: ${code}`);
  return {
    id: `${date}-${code}`,
    reading_date: date,
    meter_id: meter.id,
    meter_code: code,
    raw_value: val,
    input_source: "xlsx_import",
    ocr_confidence: null,
    is_rollover: false,
    is_meter_replaced: false,
    replacement_baseline: null,
    status: "approved",
    ...opts,
  };
}

describe("buildSpreadsheetColumns", () => {
  it("builds all 91 canonical 2026 columns A..CM and locks calculated/reference/config cells", () => {
    const cols = buildSpreadsheetColumns(INITIAL_LOCAL_METERS, "all");
    expect(cols).toHaveLength(91);
    expect(cols[0].col_letter_2026).toBe("A");
    expect(cols[0].kind).toBe("KEY");
    expect(cols[0].editable).toBe(false);

    expect(cols[cols.length - 1].col_letter_2026).toBe("CM");
    expect(cols[cols.length - 1].key).toBe("cag_condutivimetro");

    const inputCols = cols.filter((c) => c.kind === "INPUT");
    const nonInputCols = cols.filter((c) => c.kind !== "INPUT");
    expect(inputCols).toHaveLength(53);
    expect(inputCols.every((c) => c.editable)).toBe(true);
    expect(nonInputCols.every((c) => !c.editable)).toBe(true);
  });

  it("filters columns by group while always preserving KEY column Data", () => {
    const chillerCols = buildSpreadsheetColumns(INITIAL_LOCAL_METERS, "chillers");
    expect(chillerCols[0].key).toBe("data");
    expect(chillerCols.slice(1).every((c) => c.group_slug.startsWith("chiller_"))).toBe(true);
    expect(chillerCols).toHaveLength(13); // Data + 12 chiller cols

    const cagCols = buildSpreadsheetColumns(INITIAL_LOCAL_METERS, "cag");
    expect(cagCols[0].key).toBe("data");
    expect(cagCols.slice(1).every((c) => c.group_slug === "cag")).toBe(true);
    expect(cagCols).toHaveLength(17); // Data + 16 CAG cols
  });
});

describe("projectNormalizedToSpreadsheet", () => {
  it("computes deltas across year boundary, Reuso rollover, Calçadão, CAG x1000, div/0 '-' and YoY without #REF!", () => {
    const readings: NormalizedReadingRecord[] = [
      // Jan 2025 (used for YoY averages)
      mkReading("2025-01-01", "agua_hidrometro_geral", 200000),
      mkReading("2025-01-02", "agua_hidrometro_geral", 200300), // delta 300
      mkReading("2025-01-03", "agua_hidrometro_geral", 200300), // delta 0 (ignored in AVERAGEIF <> 0)
      mkReading("2025-01-04", "agua_hidrometro_geral", 200800), // delta 500 => Jan 2025 avg = 400

      // Reuso rollover 2025-09-18 -> 2025-09-19
      mkReading("2025-09-18", "agua_reuso", 9999),
      mkReading("2025-09-19", "agua_reuso", 4, { is_rollover: true }),

      // 2025-12-31 -> 2026-01-01 transition
      mkReading("2025-12-31", "agua_hidrometro_geral", 243338),
      mkReading("2025-12-31", "agua_reuso", 2775),
      mkReading("2025-12-31", "agua_irrigacao_calcadao", 1490),
      mkReading("2025-12-31", "cag_medidor_kwh", 39007),
      mkReading("2025-12-31", "cag_medidor_m3", 327327),

      mkReading("2026-01-01", "agua_hidrometro_geral", 243658), // delta 320
      mkReading("2026-01-01", "agua_horas_carregamento", 4),
      mkReading("2026-01-01", "agua_reuso", 2788), // delta 13
      mkReading("2026-01-01", "agua_irrigacao_calcadao", 1498), // delta 8 (fixed Calçadão!)
      mkReading("2026-01-01", "bss1_consumo_fp", 26000),
      mkReading("2026-01-01", "bss1_consumo_p", 4472),
      mkReading("2026-01-01", "bss2_consumo_fp", 1854),
      mkReading("2026-01-01", "bss2_consumo_p", 0),
      mkReading("2026-01-01", "bss3_consumo_fp", 1114),
      mkReading("2026-01-01", "bss3_consumo_p", 0),
      mkReading("2026-01-01", "bss4_consumo_fp", 385),
      mkReading("2026-01-01", "bss4_consumo_p", 0),
      mkReading("2026-01-01", "cag_medidor_kwh", 39015), // delta * 1000 = 8000
      mkReading("2026-01-01", "cag_medidor_m3", 327377), // delta = 50
      mkReading("2026-01-01", "cag_condutivimetro", 753), // ALTO (warning)

      // 2026-01-02: Consumo Geral == 0 (div/0 test for CAG % Água!)
      mkReading("2026-01-02", "agua_hidrometro_geral", 243658), // delta = 0
      mkReading("2026-01-02", "cag_medidor_m3", 327410), // delta = 33
    ];

    const res = projectNormalizedToSpreadsheet({
      meters: INITIAL_LOCAL_METERS,
      readings,
      filters: { sort: "asc" },
    });

    const sep19 = res.rows.find((r) => r.reading_date === "2025-09-19")!;
    expect(sep19.cells.calc_agua_consumo_reuso.value).toBe(5);

    const jan01 = res.rows.find((r) => r.reading_date === "2026-01-01")!;
    expect(jan01.cells.calc_agua_consumo_geral.value).toBe(320);
    expect(jan01.cells.yoy_agua_consumo_geral.value).toBe(400); // AVERAGEIF<>0 of Jan 2025, no #REF!
    expect(jan01.cells.calc_agua_abastecimento_cisternas.value).toBe(
      "Tempo total de carregamento - 4 horas",
    );
    expect(jan01.cells.calc_agua_consumo_reuso.value).toBe(13);
    expect(jan01.cells.calc_agua_consumo_calcadao.value).toBe(8);
    expect(jan01.cells.calc_energia_consumo_total.value).toBe(33825);
    expect(jan01.cells.calc_cag_consumo_kwh.value).toBe(8000);
    expect(jan01.cells.calc_cag_consumo_m3.value).toBe(50);
    expect(jan01.cells.calc_cag_pct_agua.value).toBe(0.15625);
    expect(jan01.cells.calc_cag_pct_agua.formatted).toBe("15,63%");
    expect(jan01.cells.cag_condutivimetro.alert_severity).toBe("warning");

    // 2026-01-02: Consumo Geral == 0 => CAG % Água displays "-" and value null
    const jan02 = res.rows.find((r) => r.reading_date === "2026-01-02")!;
    expect(jan02.cells.calc_agua_consumo_geral.value).toBe(0);
    expect(jan02.cells.calc_cag_pct_agua.value).toBeNull();
    expect(jan02.cells.calc_cag_pct_agua.formatted).toBe("-");
  });

  it("generates full 365-day calendar ordered 01/01 -> 31/12 (ascending) with null empty INPUT cells and honors filters", () => {
    const readings: NormalizedReadingRecord[] = [
      mkReading("2025-01-01", "agua_hidrometro_geral", 200000),
      mkReading("2025-12-31", "agua_hidrometro_geral", 243338),
      mkReading("2026-01-01", "agua_hidrometro_geral", 243658),
      mkReading("2026-02-14", "cag_condutivimetro", 1120),
      mkReading("2026-11-10", "agua_horas_carregamento", 3, { status: "pending_review" }),
    ];

    const full2025 = projectNormalizedToSpreadsheet({
      meters: INITIAL_LOCAL_METERS,
      readings,
      filters: { year: 2025 },
    });
    expect(full2025.rows).toHaveLength(365);
    expect(full2025.rows[0].reading_date).toBe("2025-01-01");
    expect(full2025.rows[364].reading_date).toBe("2025-12-31");
    // Unpopulated date keeps INPUT cell value as null
    const mid2025 = full2025.rows.find((r) => r.reading_date === "2025-07-15")!;
    expect(mid2025.cells.agua_hidrometro_geral.value).toBeNull();
    expect(mid2025.cells.agua_hidrometro_geral.formatted).toBe("-");

    const full2026 = projectNormalizedToSpreadsheet({
      meters: INITIAL_LOCAL_METERS,
      readings,
      filters: { year: 2026 },
    });
    expect(full2026.rows).toHaveLength(365);
    expect(full2026.rows[0].reading_date).toBe("2026-01-01");
    expect(full2026.rows[0].cells.calc_agua_consumo_geral.value).toBe(320);
    expect(full2026.rows[364].reading_date).toBe("2026-12-31");

    const feb2026 = projectNormalizedToSpreadsheet({
      meters: INITIAL_LOCAL_METERS,
      readings,
      filters: { year: 2026, month: 2 },
    });
    expect(feb2026.rows).toHaveLength(28);
    expect(feb2026.rows[0].reading_date).toBe("2026-02-01");
    expect(feb2026.rows[27].reading_date).toBe("2026-02-28");

    const onlyAlerts = projectNormalizedToSpreadsheet({
      meters: INITIAL_LOCAL_METERS,
      readings,
      filters: { year: 2026, onlyPendingOrAlerts: true },
    });
    expect(onlyAlerts.rows.map((r) => r.reading_date)).toEqual([
      "2026-02-14",
      "2026-11-10",
    ]);
  });
});

describe("exportSpreadsheetToXlsxBuffer & exportSpreadsheetToCsv", () => {
  it("exports XLSX with active formulas (Calçadão fixed, CAG x1000, div/0 '-', zero #REF!) and CSV with BOM", async () => {
    const readings: NormalizedReadingRecord[] = [
      mkReading("2026-01-01", "agua_hidrometro_geral", 243338),
      mkReading("2026-01-01", "agua_horas_carregamento", 4),
      mkReading("2026-01-01", "agua_irrigacao_calcadao", 1490),
      mkReading("2026-01-01", "cag_medidor_kwh", 39007),
      mkReading("2026-01-01", "cag_medidor_m3", 327327),

      mkReading("2026-01-02", "agua_hidrometro_geral", 243338), // delta 0
      mkReading("2026-01-02", "agua_irrigacao_calcadao", 1495), // delta 5
      mkReading("2026-01-02", "cag_medidor_kwh", 39015), // delta * 1000 = 8000
      mkReading("2026-01-02", "cag_medidor_m3", 327377), // delta 50
    ];

    const buf = await exportSpreadsheetToXlsxBuffer({
      meters: INITIAL_LOCAL_METERS,
      readings,
      year: 2026,
    });
    expect(buf.byteLength).toBeGreaterThan(1000);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("2026");
    expect(ws).toBeDefined();
    expect(ws!.getRow(1).cellCount).toBe(CANONICAL_COLUMNS_2026.length);

    // Row 3 (2026-01-02): Calçadão (col L = 12) has working formula
    const calcadaoCell = ws!.getRow(3).getCell(12).value as ExcelJS.CellFormulaValue;
    expect(calcadaoCell.formula).toContain("K3-K2");
    expect(calcadaoCell.result).toBe(5);

    // Row 3: CAG Consumo kWh (col BY = 77) has *1000 formula
    const cagKwhCell = ws!.getRow(3).getCell(77).value as ExcelJS.CellFormulaValue;
    expect(cagKwhCell.formula).toContain("*1000");
    expect(cagKwhCell.result).toBe(8000);

    // Row 3: CAG % Água (col CG = 85) returns "-" when C3 <= 0
    const cagAguaPctCell = ws!.getRow(3).getCell(85).value as ExcelJS.CellFormulaValue;
    expect(cagAguaPctCell.formula).toContain('"-"');
    expect(cagAguaPctCell.result).toBe("-");

    // CSV export contains UTF-8 BOM and semicolon headers
    const projected = projectNormalizedToSpreadsheet({
      meters: INITIAL_LOCAL_METERS,
      readings,
      filters: { year: 2026, sort: "asc" },
    });
    const csv = exportSpreadsheetToCsv(projected);
    expect(csv.startsWith("\uFEFFData;")).toBe(true);
    expect(csv).toContain("Irrigação Calçadão (m³)");
  });
});
