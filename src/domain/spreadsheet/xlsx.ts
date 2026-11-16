import ExcelJS from "exceljs";
import type { MeterDto, PlanilhaResponse } from "@/types/contracts";
import {
  projectNormalizedToSpreadsheet,
  type NormalizedReadingRecord,
} from "./projection";

export interface ExportWorkbookInput {
  meters: MeterDto[];
  readings: NormalizedReadingRecord[];
  year?: number;
}

function getColumnLetter(planilha: PlanilhaResponse, key: string): string {
  const col = planilha.columns.find((c) => c.key === key);
  return col?.col_letter_2026 ?? "";
}

function addYearWorksheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  planilha: PlanilhaResponse,
  prevYearSheetName: string | null,
) {
  const ws = wb.addWorksheet(sheetName);

  // Header row (Row 1)
  const headerRow = ws.getRow(1);
  planilha.columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb:
          col.kind === "INPUT"
            ? "FF1E3A8A"
            : col.kind === "CONFIG"
              ? "FF475569"
              : col.kind === "REFERENCE_YOY"
                ? "FF0F766E"
                : "FF1E293B",
      },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    ws.getColumn(idx + 1).width = idx === 0 ? 14 : 20;
  });
  headerRow.height = 34;

  // Freeze Date column + Header row
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];

  // Rows (chronological ascending in Excel)
  planilha.rows.forEach((rowDto, rowIdx) => {
    const excelRowNum = rowIdx + 2;
    const prevExcelRowNum = excelRowNum - 1;
    const row = ws.getRow(excelRowNum);

    planilha.columns.forEach((col, colIdx) => {
      const cellDto = rowDto.cells[col.key];
      const cell = row.getCell(colIdx + 1);

      if (col.kind === "KEY") {
        const [y, m, d] = rowDto.reading_date.split("-").map(Number);
        cell.value = new Date(Date.UTC(y, m - 1, d));
        cell.numFmt = "dd/mm/yyyy";
        return;
      }

      if (col.kind === "INPUT" || col.kind === "CONFIG") {
        cell.value =
          typeof cellDto?.value === "number" ? cellDto.value : null;
        return;
      }

      const numResult =
        typeof cellDto?.value === "number" || typeof cellDto?.value === "string"
          ? cellDto.value
          : undefined;

      // Active native Excel formulas (with corrected Calçadão, CAG % Água N/D, and zero #REF!)
      if (col.key === "calc_agua_consumo_geral" && excelRowNum > 2) {
        cell.value = {
          formula: `IF(OR(B${excelRowNum}="",B${prevExcelRowNum}=""),"",B${excelRowNum}-B${prevExcelRowNum})`,
          result: numResult,
        };
      } else if (col.key === "calc_agua_abastecimento_cisternas") {
        cell.value = {
          formula: `IF(F${excelRowNum}="","","Tempo total de carregamento - "&F${excelRowNum}&" horas")`,
          result: numResult,
        };
      } else if (col.key === "calc_agua_consumo_reuso" && excelRowNum > 2) {
        const val = cellDto?.is_rollover
          ? numResult
          : {
              formula: `IF(OR(G${excelRowNum}="",G${prevExcelRowNum}=""),"",IF(G${excelRowNum}<G${prevExcelRowNum},(10000-G${prevExcelRowNum})+G${excelRowNum},G${excelRowNum}-G${prevExcelRowNum}))`,
              result: numResult,
            };
        cell.value = val ?? null;
      } else if (col.key === "calc_agua_consumo_muro_verde" && excelRowNum > 2) {
        cell.value = {
          formula: `IF(OR(I${excelRowNum}="",I${prevExcelRowNum}=""),"",I${excelRowNum}-I${prevExcelRowNum})`,
          result: numResult,
        };
      } else if (col.key === "calc_agua_consumo_calcadao" && excelRowNum > 2) {
        // Fixed formula (was broken "=" in original 2026 sheet)
        cell.value = {
          formula: `IF(OR(K${excelRowNum}="",K${prevExcelRowNum}=""),"",K${excelRowNum}-K${prevExcelRowNum})`,
          result: numResult,
        };
      } else if (col.key === "calc_temp_media_jockey") {
        cell.value = {
          formula: `IFERROR(AVERAGE(P${excelRowNum}:W${excelRowNum}),"")`,
          result: numResult,
        };
      } else if (col.key === "calc_temp_media_guaiba") {
        cell.value = {
          formula: `IFERROR(AVERAGE(X${excelRowNum}:AC${excelRowNum}),"")`,
          result: numResult,
        };
      } else if (col.key === "calc_bss1_consumo_geral") {
        cell.value = {
          formula: `IF(AND(AE${excelRowNum}="",AF${excelRowNum}=""),"",SUM(AE${excelRowNum}:AF${excelRowNum}))`,
          result: numResult,
        };
      } else if (col.key === "calc_bss2_consumo_geral") {
        cell.value = {
          formula: `IF(AND(AJ${excelRowNum}="",AK${excelRowNum}=""),"",SUM(AJ${excelRowNum}:AK${excelRowNum}))`,
          result: numResult,
        };
      } else if (col.key === "calc_bss3_consumo_geral") {
        cell.value = {
          formula: `IF(AND(AO${excelRowNum}="",AP${excelRowNum}=""),"",SUM(AO${excelRowNum}:AP${excelRowNum}))`,
          result: numResult,
        };
      } else if (col.key === "calc_bss4_consumo_geral") {
        cell.value = {
          formula: `IF(AND(AT${excelRowNum}="",AU${excelRowNum}=""),"",SUM(AT${excelRowNum}:AU${excelRowNum}))`,
          result: numResult,
        };
      } else if (col.key === "calc_energia_consumo_total") {
        cell.value = {
          formula: `SUM(AD${excelRowNum},AI${excelRowNum},AN${excelRowNum},AS${excelRowNum})`,
          result: numResult,
        };
      } else if (col.key === "calc_cag_consumo_kwh" && excelRowNum > 2) {
        const bx = getColumnLetter(planilha, "cag_medidor_kwh");
        cell.value = {
          formula: `IF(OR(${bx}${excelRowNum}="",${bx}${prevExcelRowNum}=""),"",(${bx}${excelRowNum}-${bx}${prevExcelRowNum})*1000)`,
          result: numResult,
        };
      } else if (col.key === "calc_cag_pct_energia") {
        const by = getColumnLetter(planilha, "calc_cag_consumo_kwh");
        cell.value = {
          formula: `IF(OR(AX${excelRowNum}="",AX${excelRowNum}<=0,${by}${excelRowNum}=""),"",${by}${excelRowNum}/AX${excelRowNum})`,
          result: numResult,
        };
        cell.numFmt = "0.00%";
      } else if (col.key === "calc_cag_consumo_m3" && excelRowNum > 2) {
        const cc = getColumnLetter(planilha, "cag_medidor_m3");
        cell.value = {
          formula: `IF(OR(${cc}${excelRowNum}="",${cc}${prevExcelRowNum}=""),"",${cc}${excelRowNum}-${cc}${prevExcelRowNum})`,
          result: numResult,
        };
      } else if (col.key === "calc_cag_pct_agua") {
        const cd = getColumnLetter(planilha, "calc_cag_consumo_m3");
        // Never mask div/0 as 100%; display "-"
        cell.value = {
          formula: `IF(OR(C${excelRowNum}="",C${excelRowNum}<=0,${cd}${excelRowNum}=""),"-",${cd}${excelRowNum}/C${excelRowNum})`,
          result: numResult ?? "-",
        };
        if (typeof numResult === "number") {
          cell.numFmt = "0.00%";
        }
      } else if (col.key === "calc_cag_agua_drenada" && excelRowNum > 2) {
        const ch = getColumnLetter(planilha, "cag_dreno_torre");
        cell.value = {
          formula: `IF(OR(${ch}${excelRowNum}="",${ch}${prevExcelRowNum}=""),"",${ch}${excelRowNum}-${ch}${prevExcelRowNum})`,
          result: numResult,
        };
      } else if (col.key === "calc_cag_agua_ladrao" && excelRowNum > 2) {
        const ck = getColumnLetter(planilha, "cag_ladrao_torre");
        cell.value = {
          formula: `IF(OR(${ck}${excelRowNum}="",${ck}${prevExcelRowNum}=""),"",${ck}${excelRowNum}-${ck}${prevExcelRowNum})`,
          result: numResult,
        };
      } else if (col.kind === "REFERENCE_YOY" && prevYearSheetName) {
        // Safe YoY value without #REF!
        cell.value = numResult ?? null;
      } else {
        cell.value = numResult ?? null;
      }
    });
  });
}

export async function exportSpreadsheetToXlsxBuffer(
  input: ExportWorkbookInput,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sistema de Medições Diárias";
  wb.created = new Date();

  const years = Array.from(
    new Set(
      input.readings
        .map((r) => Number(r.reading_date.slice(0, 4)))
        .filter((y) => Number.isFinite(y)),
    ),
  ).sort((a, b) => a - b);

  const targetYears =
    input.year !== undefined
      ? [input.year]
      : years.length > 0
        ? years
        : [new Date().getFullYear()];

  for (const y of targetYears) {
    const projected = projectNormalizedToSpreadsheet({
      meters: input.meters,
      readings: input.readings,
      filters: { year: y, sort: "asc", includeFullCalendar: false },
    });
    const prevName = years.includes(y - 1) ? String(y - 1) : null;
    addYearWorksheet(wb, String(y), projected, prevName);
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export function exportSpreadsheetToCsv(planilha: PlanilhaResponse): string {
  const escape = (val: string) => {
    if (val.includes(";") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const lines: string[] = [];
  lines.push(planilha.columns.map((c) => escape(c.header)).join(";"));

  for (const row of planilha.rows) {
    const cols = planilha.columns.map((c) => {
      const cell = row.cells[c.key];
      if (!cell || cell.value === null || cell.value === undefined) return "";
      return escape(cell.formatted);
    });
    lines.push(cols.join(";"));
  }

  // UTF-8 BOM for direct Excel open
  return `\uFEFF${lines.join("\r\n")}`;
}
