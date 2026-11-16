import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/database';

const DEFAULT_XLSX_PATHS = [
  'C:/Users/luizf/.gemini/antigravity/brain/9ea36063-cfbf-4977-a6b6-199cfa5e1d59/.user_uploaded/media_1794775267125_2326a606.xlsx',
  path.resolve(process.cwd(), 'Medições_Diarias_Rev08.xlsx'),
];

/**
 * Mapeamento de cabeçalhos de entrada bruta (excel_header) para códigos estáveis de medidores (meters.code).
 * Cobre todos os 41 inputs de 2025 e os 53 inputs de 2026 (incluindo Chillers 1 e 2).
 */
export const EXCEL_HEADER_TO_METER_CODE: Record<string, string> = {
  // Água
  'Água - Hidrometro Geral': 'agua_hidrometro_geral',
  'Horas de carregamento': 'agua_horas_carregamento',
  'Reuso (Estação Elevatória)': 'agua_reuso',
  'Muro verde Barracadabra': 'agua_muro_verde',
  'Irrigação Calçadão (m³)': 'agua_irrigacao_calcadao',

  // Temperaturas
  'Temperatura - Externa (°C)': 'temp_externa',
  '1 - GT Renner (Joquey)': 'temp_jockey_01_gt_renner',
  "2 - Expansão O'pasta (Joquey)": 'temp_jockey_02_opasta',
  '3 - Ville Grill (Joquey)': 'temp_jockey_03_ville_grill',
  '4 - Expansão Severo Burger (Joquey)': 'temp_jockey_04_severo_burger',
  '5 - Pet Jolie (Joquey)': 'temp_jockey_05_pet_jolie',
  '6 - Press Café (Joquey)': 'temp_jockey_06_press_cafe',
  '7 - Cacau Show (Joquey)': 'temp_jockey_07_cacau_show',
  '15- Petiskeira (Joquey)': 'temp_jockey_15_petiskeira',
  '8 - GT Renner (Guaíba)': 'temp_guaiba_08_gt_renner',
  '10 - Sommelier (Guaíba)': 'temp_guaiba_10_sommelier',
  '11 - Bacio (Guaíba)': 'temp_guaiba_11_bacio',
  '12 - Mahogany (Guaíba)': 'temp_guaiba_12_mahogany',
  '13 - Vivo (Guaíba)': 'temp_guaiba_13_vivo',
  '14 - Cobasi (Guaíba)': 'temp_guaiba_14_cobasi',

  // BSS 1..4 Consumo
  'Consumo BSS 1 - Fora Ponta (kWh)': 'bss1_consumo_fp',
  'Consumo BSS 1 - Ponta (kWh)': 'bss1_consumo_p',
  'Consumo BSS 2 - Fora Ponta (kWh)': 'bss2_consumo_fp',
  'Consumo BSS 2 - Ponta (kWh)': 'bss2_consumo_p',
  'Consumo BSS 3 - Fora Ponta (kWh)': 'bss3_consumo_fp',
  'Consumo BSS 3 - Ponta (kWh)': 'bss3_consumo_p',
  'Consumo BSS 4 - Fora Ponta (kWh)': 'bss4_consumo_fp',
  'Consumo BSS 4 - Ponta (kWh)': 'bss4_consumo_p',

  // BSS 1..4 Demanda
  'Demanda BSS 1 - Fora Ponta (kW)': 'bss1_demanda_fp',
  'Demanda BSS 1 - Ponta (kW)': 'bss1_demanda_p',
  'Demanda BSS 2 - Fora Ponta (kW)': 'bss2_demanda_fp',
  'Demanda BSS 2 - Ponta (kW)': 'bss2_demanda_p',
  'Demanda BSS 3 - Fora Ponta (kW)': 'bss3_demanda_fp',
  'Demanda BSS 3 - Ponta (kW)': 'bss3_demanda_p',
  'Demanda BSS 4 - Fora Ponta (kW)': 'bss4_demanda_fp',
  'Demanda BSS 4 - Ponta (kW)': 'bss4_demanda_p',

  // Chiller 1 & 2 (2026+)
  'Chiller 1 - Set Point CAG (°C)': 'chiller1_setpoint_cag',
  'Chiller 1 - Temp. Saída água gelada (°C)': 'chiller1_temp_saida_ag',
  'Chiller 1 - Aproach Evaporador': 'chiller1_aproach_evap',
  'Chiller 1 - Aproach Condensador': 'chiller1_aproach_cond',
  'Chiller 1 - Motor %': 'chiller1_motor_pct',
  'Chiller 1 - Tempo total de operação': 'chiller1_tempo_operacao',
  'Chiller 2 - Set Point CAG (°C)': 'chiller2_setpoint_cag',
  'Chiller 2 - Temp. Saída água gelada (°C)': 'chiller2_temp_saida_ag',
  'Chiller 2 - Aproach Evaporador': 'chiller2_aproach_evap',
  'Chiller 2 - Aproach Condensador': 'chiller2_aproach_cond',
  'Chiller 2 - Motor %': 'chiller2_motor_pct',
  'Chiller 2 - Tempo total de operação': 'chiller2_tempo_operacao',

  // CAG
  'CAG - Leitura do medidor (kWh)': 'cag_medidor_kwh',
  'CAG - Leitura do medidor (m³)': 'cag_medidor_m3',
  'CAG - Dreno da Torre (m³)': 'cag_dreno_torre',
  'CAG - Ladrão da Torre (m³)': 'cag_ladrao_torre',
  'CAG - Condutivimetro (< 700 ok; 700 >= 1000 alto; > 1000 critico)': 'cag_condutivimetro',
};

/**
 * Rollovers históricos conhecidos na planilha original.
 * Chave: `${reading_date}|${meter_code}`
 */
export const HISTORICAL_ROLLOVERS: Record<string, { note: string }> = {
  '2025-09-19|agua_reuso': {
    note: 'Virada histórica do hidrômetro de Reuso (9999 -> 4, visor 4 dígitos capacidade 10000)',
  },
};

export interface ParsedHistoricalReading {
  readingDate: string;
  meterCode: string;
  rawValue: number;
  isRollover: boolean;
  notes: string | null;
  sheetName: string;
  rowNumber: number;
}

export interface HistoricalParseReport {
  readings: ParsedHistoricalReading[];
  sheetsProcessed: string[];
  rowsBySheet: Record<string, number>;
  rolloversDetected: Array<{ readingDate: string; meterCode: string; rawValue: number; note: string }>;
  matchedHeadersBySheet: Record<string, number>;
  skippedNonNumericCells: number;
}

function normalizeHeader(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'richText' in (value as Record<string, unknown>)) {
    const rt = (value as { richText: Array<{ text: string }> }).richText;
    return rt.map((part) => part.text).join('').trim();
  }
  return String(value).trim();
}

function extractNoteText(note: ExcelJS.Cell['note']): string | null {
  if (!note) return null;
  if (typeof note === 'string') {
    const trimmed = note.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof note === 'object' && Array.isArray(note.texts)) {
    const joined = note.texts.map((t) => t.text ?? '').join('').trim();
    return joined.length > 0 ? joined : null;
  }
  return null;
}

function parseExcelDate(value: ExcelJS.CellValue): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 20000) {
    // Excel epoch (1899-12-30 UTC)
    const utcMs = Math.round((value - 25569) * 86400 * 1000);
    const dt = new Date(utcMs);
    const year = dt.getUTCFullYear();
    const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dt.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  }
  return null;
}

function parseNumericCell(value: ExcelJS.CellValue): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'object') {
    if ('error' in value) return null;
    if ('result' in value) {
      return parseNumericCell(value.result ?? null);
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      const text = value.richText.map((r) => r.text).join('');
      return parseNumericCell(text);
    }
    return null;
  }
  if (typeof value === 'string') {
    const cleaned = value.trim();
    if (!cleaned || cleaned.startsWith('#')) return null;
    const normalized = cleaned.includes(',') && !cleaned.includes('.')
      ? cleaned.replace(',', '.')
      : cleaned;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function parseHistoricalWorkbook(
  filePath: string,
  targetSheets: string[] = ['2025', '2026'],
): Promise<HistoricalParseReport> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const readings: ParsedHistoricalReading[] = [];
  const sheetsProcessed: string[] = [];
  const rowsBySheet: Record<string, number> = {};
  const matchedHeadersBySheet: Record<string, number> = {};
  const rolloversDetected: HistoricalParseReport['rolloversDetected'] = [];
  let skippedNonNumericCells = 0;

  for (const sheetName of targetSheets) {
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) {
      throw new Error(`Aba "${sheetName}" não encontrada em ${filePath}`);
    }

    sheetsProcessed.push(sheetName);
    rowsBySheet[sheetName] = 0;

    // Mapeia índice de coluna -> meterCode baseado apenas na linha 1 (cabeçalho)
    const headerRow = worksheet.getRow(1);
    const colToMeterCode = new Map<number, string>();
    let dateColIndex = 1;

    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = normalizeHeader(cell.value);
      if (header === 'Data') {
        dateColIndex = colNumber;
        return;
      }
      const meterCode = EXCEL_HEADER_TO_METER_CODE[header];
      if (meterCode) {
        colToMeterCode.set(colNumber, meterCode);
      }
    });

    matchedHeadersBySheet[sheetName] = colToMeterCode.size;

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;

      const dateVal = row.getCell(dateColIndex).value;
      const readingDate = parseExcelDate(dateVal);
      if (!readingDate) return;

      let rowHadReading = false;

      for (const [colNumber, meterCode] of colToMeterCode.entries()) {
        const cell = row.getCell(colNumber);
        const rawCellValue = cell.value;

        if (rawCellValue === null || rawCellValue === undefined || rawCellValue === '') {
          continue;
        }

        const numericValue = parseNumericCell(rawCellValue);
        if (numericValue === null) {
          skippedNonNumericCells += 1;
          continue;
        }

        rowHadReading = true;
        const rolloverKey = `${readingDate}|${meterCode}`;
        const knownRollover = HISTORICAL_ROLLOVERS[rolloverKey];
        const cellComment = extractNoteText(cell.note);
        const combinedNote = [knownRollover?.note, cellComment].filter(Boolean).join(' | ') || null;

        if (knownRollover) {
          rolloversDetected.push({
            readingDate,
            meterCode,
            rawValue: numericValue,
            note: knownRollover.note,
          });
        }

        readings.push({
          readingDate,
          meterCode,
          rawValue: numericValue,
          isRollover: Boolean(knownRollover),
          notes: combinedNote,
          sheetName,
          rowNumber,
        });
      }

      if (rowHadReading) {
        rowsBySheet[sheetName] += 1;
      }
    });
  }

  return {
    readings,
    sheetsProcessed,
    rowsBySheet,
    rolloversDetected,
    matchedHeadersBySheet,
    skippedNonNumericCells,
  };
}

function resolveDefaultFilePath(): string {
  for (const candidate of DEFAULT_XLSX_PATHS) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return DEFAULT_XLSX_PATHS[0];
}

interface CliArgs {
  filePath: string;
  dryRun: boolean;
  sheets: string[];
  batchSize: number;
}

function parseCliArgs(argv: string[]): CliArgs {
  let filePath = resolveDefaultFilePath();
  let dryRun = false;
  let sheets = ['2025', '2026'];
  let batchSize = 500;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--file' && argv[i + 1]) {
      filePath = argv[i + 1];
      i += 1;
    } else if (arg === '--sheets' && argv[i + 1]) {
      sheets = argv[i + 1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      i += 1;
    } else if (arg === '--batch-size' && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (Number.isInteger(parsed) && parsed > 0) {
        batchSize = parsed;
      }
      i += 1;
    }
  }

  return { filePath, dryRun, sheets, batchSize };
}

async function runCli(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));

  if (!fs.existsSync(args.filePath)) {
    throw new Error(`Arquivo XLSX não encontrado: ${args.filePath}`);
  }

  console.log(`[import-historical-xlsx] Lendo ${args.filePath} (abas: ${args.sheets.join(', ')})...`);
  const report = await parseHistoricalWorkbook(args.filePath, args.sheets);

  console.log('[import-historical-xlsx] Resumo do parsing:');
  console.log(`  - Abas processadas: ${report.sheetsProcessed.join(', ')}`);
  console.log(`  - Colunas de entrada mapeadas por aba: ${JSON.stringify(report.matchedHeadersBySheet)}`);
  console.log(`  - Dias com leituras por aba: ${JSON.stringify(report.rowsBySheet)}`);
  console.log(`  - Total de leituras brutas extraídas: ${report.readings.length}`);
  console.log(`  - Células não numéricas ignoradas: ${report.skippedNonNumericCells}`);
  console.log(`  - Rollovers históricos aplicados: ${report.rolloversDetected.length}`);
  for (const r of report.rolloversDetected) {
    console.log(`      * ${r.readingDate} [${r.meterCode}] = ${r.rawValue} (${r.note})`);
  }

  if (args.dryRun) {
    console.log('[import-historical-xlsx] --dry-run ativo. Nenhuma escrita foi feita no Supabase.');
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Variáveis NEXT_PUBLIC_SUPABASE_URL (ou SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY são obrigatórias para gravar no Supabase (use --dry-run para validar localmente).',
    );
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: meters, error: metersError } = await supabase
    .from('meters')
    .select('id, code');

  if (metersError) {
    throw new Error(`Erro ao carregar catálogo de medidores: ${metersError.message}`);
  }

  const meterIdByCode = new Map<string, string>(
    (meters ?? []).map((m) => [m.code, m.id]),
  );

  const missingCodes = new Set<string>();
  const payload: Database['public']['Tables']['meter_readings']['Insert'][] = [];

  for (const item of report.readings) {
    const meterId = meterIdByCode.get(item.meterCode);
    if (!meterId) {
      missingCodes.add(item.meterCode);
      continue;
    }

    payload.push({
      reading_date: item.readingDate,
      meter_id: meterId,
      raw_value: item.rawValue,
      input_source: 'xlsx_import',
      is_rollover: item.isRollover,
      is_meter_replaced: false,
      notes: item.notes,
      status: 'approved',
    });
  }

  if (missingCodes.size > 0) {
    throw new Error(
      `Medidores ausentes no banco (aplique 0003_seed_catalog.sql antes): ${Array.from(missingCodes).join(', ')}`,
    );
  }

  let upserted = 0;
  for (let i = 0; i < payload.length; i += args.batchSize) {
    const chunk = payload.slice(i, i + args.batchSize);
    const { error: upsertError } = await supabase
      .from('meter_readings')
      .upsert(chunk, { onConflict: 'reading_date,meter_id' });

    if (upsertError) {
      throw new Error(
        `Erro no lote ${i}..${i + chunk.length}: ${upsertError.message}`,
      );
    }

    upserted += chunk.length;
    console.log(`[import-historical-xlsx] Upsert concluído: ${upserted}/${payload.length}`);
  }

  console.log(`[import-historical-xlsx] Importação finalizada com sucesso (${upserted} leituras).`);
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]).endsWith('import-historical-xlsx.ts');

if (isDirectExecution) {
  runCli().catch((err) => {
    console.error('[import-historical-xlsx] Falha:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
