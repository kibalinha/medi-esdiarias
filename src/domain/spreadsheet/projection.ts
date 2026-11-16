import {
  computeArithmeticAverage,
  computeAverageNonZero,
  computeBssGeneralConsumption,
  computeCagEnergyPercent,
  computeCagWaterPercent,
  computeCumulativeDelta,
  computeTotalEnergyConsumption,
  formatCisternasText,
  formatNumberBr,
  formatPercentBr,
  parseYearMonth,
  type DatedMetricValue,
} from "@/domain/calculations";
import {
  evaluateCagWaterAnomaly,
  evaluateReadingAlerts,
} from "@/domain/alerts";
import type {
  AlertDto,
  AlertSeverity,
  InputSource,
  MeterDto,
  PlanilhaCellDto,
  PlanilhaKpisDto,
  PlanilhaResponse,
  PlanilhaRowDto,
  ReadingStatus,
  SpreadsheetColumnDefDto,
} from "@/types/contracts";
import { buildSpreadsheetColumns } from "./columns";

export interface NormalizedReadingRecord {
  id: string;
  reading_date: string; // YYYY-MM-DD
  meter_id: string;
  meter_code: string;
  raw_value: number;
  input_source: InputSource;
  ocr_confidence: number | null;
  is_rollover: boolean;
  is_meter_replaced: boolean;
  replacement_baseline: number | null;
  status: ReadingStatus;
}

export interface ProjectSpreadsheetInput {
  meters: MeterDto[];
  readings: NormalizedReadingRecord[];
  alerts?: AlertDto[];
  photoCountByReadingId?: Record<string, number>;
  filters?: {
    year?: number;
    month?: number;
    group?: string;
    search?: string;
    onlyPendingOrAlerts?: boolean;
    startDate?: string;
    endDate?: string;
    sort?: "asc" | "desc";
    includeFullCalendar?: boolean;
  };
}

function generateCalendarDates(year: number, month?: number): string[] {
  const dates: string[] = [];
  const startMonth = month !== undefined ? month : 1;
  const endMonth = month !== undefined ? month : 12;

  for (let m = startMonth; m <= endMonth; m += 1) {
    const daysInMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();
    const mm = String(m).padStart(2, "0");
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dd = String(day).padStart(2, "0");
      dates.push(`${year}-${mm}-${dd}`);
    }
  }
  return dates;
}

const JOCKEY_CODES = [
  "temp_jockey_01_gt_renner",
  "temp_jockey_02_opasta",
  "temp_jockey_03_ville_grill",
  "temp_jockey_04_severo_burger",
  "temp_jockey_05_pet_jolie",
  "temp_jockey_06_press_cafe",
  "temp_jockey_07_cacau_show",
  "temp_jockey_15_petiskeira",
];

const GUAIBA_CODES = [
  "temp_guaiba_08_gt_renner",
  "temp_guaiba_10_sommelier",
  "temp_guaiba_11_bacio",
  "temp_guaiba_12_mahogany",
  "temp_guaiba_13_vivo",
  "temp_guaiba_14_cobasi",
];

const DEFAULT_TETOS: Record<string, number> = {
  cfg_bss1_teto_fp: 2800,
  cfg_bss1_teto_p: 2600,
  cfg_bss2_teto: 500,
  cfg_bss3_teto: 200,
  cfg_bss4_teto: 340,
};

function buildMonthlyAverageMap(
  entries: DatedMetricValue[],
): Map<string, number | null> {
  const buckets = new Map<string, number[]>();
  for (const entry of entries) {
    const ym = parseYearMonth(entry.date);
    if (!ym) continue;
    const key = `${ym.year}-${String(ym.month).padStart(2, "0")}`;
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    if (
      entry.value !== null &&
      entry.value !== undefined &&
      Number.isFinite(entry.value)
    ) {
      list.push(entry.value);
    }
  }
  const result = new Map<string, number | null>();
  for (const [ymKey, vals] of buckets.entries()) {
    result.set(ymKey, computeAverageNonZero(vals));
  }
  return result;
}

function getMonthlyAvg(
  map: Map<string, number | null>,
  year: number,
  month: number,
): number | null {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  return map.get(key) ?? null;
}

function formatDateBr(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function projectNormalizedToSpreadsheet(
  input: ProjectSpreadsheetInput,
): PlanilhaResponse {
  const {
    meters,
    readings,
    alerts = [],
    photoCountByReadingId = {},
    filters = {},
  } = input;

  const meterByCode = new Map(meters.map((m) => [m.code, m]));
  const allColumns = buildSpreadsheetColumns(meters, "all");
  const visibleColumns: SpreadsheetColumnDefDto[] = buildSpreadsheetColumns(
    meters,
    filters.group,
  );

  // Organize readings by date and meter_code
  const dateSet = new Set<string>();
  const yearSet = new Set<number>();
  const readingByDateAndCode = new Map<string, NormalizedReadingRecord>();
  const readingsByMeterCode = new Map<string, NormalizedReadingRecord[]>();

  for (const r of readings) {
    const dateStr = r.reading_date.slice(0, 10);
    dateSet.add(dateStr);
    const ym = parseYearMonth(dateStr);
    if (ym) yearSet.add(ym.year);

    readingByDateAndCode.set(`${dateStr}::${r.meter_code}`, {
      ...r,
      reading_date: dateStr,
    });

    let arr = readingsByMeterCode.get(r.meter_code);
    if (!arr) {
      arr = [];
      readingsByMeterCode.set(r.meter_code, arr);
    }
    arr.push({ ...r, reading_date: dateStr });
  }

  for (const arr of readingsByMeterCode.values()) {
    arr.sort((a, b) => a.reading_date.localeCompare(b.reading_date));
  }

  // Precompute cumulative deltas for every cumulative meter across all dates
  interface DeltaMemo {
    delta: number | null;
    isDropWithoutFlag: boolean;
    isMultiDayDelta: boolean;
    previousValue: number | null;
  }
  const deltaByDateAndCode = new Map<string, DeltaMemo>();

  for (const [meterCode, arr] of readingsByMeterCode.entries()) {
    const meter = meterByCode.get(meterCode);
    if (!meter || meter.reading_kind !== "cumulative") continue;

    for (let i = 0; i < arr.length; i += 1) {
      const curr = arr[i];
      const prev = i > 0 ? arr[i - 1] : null;
      const res = computeCumulativeDelta({
        currentValue: curr.raw_value,
        previousValue: prev?.raw_value ?? null,
        currentDate: curr.reading_date,
        previousDate: prev?.reading_date ?? null,
        multiplierFactor: meter.multiplier_factor,
        dialCapacity: meter.dial_capacity,
        isRollover: curr.is_rollover,
        isMeterReplaced: curr.is_meter_replaced,
        replacementBaseline: curr.replacement_baseline,
      });
      deltaByDateAndCode.set(`${curr.reading_date}::${meterCode}`, {
        delta: res.delta,
        isDropWithoutFlag: res.isDropWithoutFlag,
        isMultiDayDelta: res.isMultiDayDelta,
        previousValue: prev?.raw_value ?? null,
      });
    }
  }

  // Index persisted alerts by reading_id and reading_date+meter_code
  const alertSeverityByReadingId = new Map<string, AlertSeverity>();
  for (const a of alerts) {
    if (!a.reading_id) continue;
    const prev = alertSeverityByReadingId.get(a.reading_id);
    if (a.severity === "critical" || !prev) {
      alertSeverityByReadingId.set(a.reading_id, a.severity);
    }
  }

  // Sort all dates ascending first to compute daily derived series
  const allDatesAsc = Array.from(dateSet).sort((a, b) => a.localeCompare(b));

  interface DailyComputed {
    aguaConsumoGeral: number | null;
    aguaConsumoReuso: number | null;
    aguaConsumoMuroVerde: number | null;
    aguaConsumoCalcadao: number | null;
    aguaCisternasText: string | null;
    tempMediaJockey: number | null;
    tempMediaGuaiba: number | null;
    bss1Geral: number | null;
    bss2Geral: number | null;
    bss3Geral: number | null;
    bss4Geral: number | null;
    energiaTotal: number | null;
    cagConsumoKwh: number | null;
    cagConsumoM3: number | null;
    cagAguaDrenada: number | null;
    cagAguaLadrao: number | null;
    cagPctEnergia: number | null;
    cagPctAgua: { ratio: number | null; isAnomaly: boolean; display: string };
  }

  const dailyByDate = new Map<string, DailyComputed>();

  const seriesAguaGeral: DatedMetricValue[] = [];
  const seriesBss1: DatedMetricValue[] = [];
  const seriesBss2: DatedMetricValue[] = [];
  const seriesBss3: DatedMetricValue[] = [];
  const seriesBss4: DatedMetricValue[] = [];
  const seriesCagKwh: DatedMetricValue[] = [];
  const seriesCagM3: DatedMetricValue[] = [];
  const seriesCagDrenada: DatedMetricValue[] = [];

  for (const d of allDatesAsc) {
    const getVal = (code: string) =>
      readingByDateAndCode.get(`${d}::${code}`)?.raw_value ?? null;
    const getDelta = (code: string) =>
      deltaByDateAndCode.get(`${d}::${code}`)?.delta ?? null;

    const aguaConsumoGeral = getDelta("agua_hidrometro_geral");
    const aguaConsumoReuso = getDelta("agua_reuso");
    const aguaConsumoMuroVerde = getDelta("agua_muro_verde");
    const aguaConsumoCalcadao = getDelta("agua_irrigacao_calcadao");
    const aguaCisternasText = formatCisternasText(
      getVal("agua_horas_carregamento"),
    );

    const tempMediaJockey = computeArithmeticAverage(
      JOCKEY_CODES.map((c) => getVal(c)),
    );
    const tempMediaGuaiba = computeArithmeticAverage(
      GUAIBA_CODES.map((c) => getVal(c)),
    );

    const bss1Geral = computeBssGeneralConsumption(
      getVal("bss1_consumo_fp"),
      getVal("bss1_consumo_p"),
    );
    const bss2Geral = computeBssGeneralConsumption(
      getVal("bss2_consumo_fp"),
      getVal("bss2_consumo_p"),
    );
    const bss3Geral = computeBssGeneralConsumption(
      getVal("bss3_consumo_fp"),
      getVal("bss3_consumo_p"),
    );
    const bss4Geral = computeBssGeneralConsumption(
      getVal("bss4_consumo_fp"),
      getVal("bss4_consumo_p"),
    );

    const energiaTotal = computeTotalEnergyConsumption([
      bss1Geral,
      bss2Geral,
      bss3Geral,
      bss4Geral,
    ]);

    const cagConsumoKwh = getDelta("cag_medidor_kwh");
    const cagConsumoM3 = getDelta("cag_medidor_m3");
    const cagAguaDrenada = getDelta("cag_dreno_torre");
    const cagAguaLadrao = getDelta("cag_ladrao_torre");

    const cagPctEnergia = computeCagEnergyPercent(cagConsumoKwh, energiaTotal);
    const cagPctAgua = computeCagWaterPercent(cagConsumoM3, aguaConsumoGeral);

    dailyByDate.set(d, {
      aguaConsumoGeral,
      aguaConsumoReuso,
      aguaConsumoMuroVerde,
      aguaConsumoCalcadao,
      aguaCisternasText,
      tempMediaJockey,
      tempMediaGuaiba,
      bss1Geral,
      bss2Geral,
      bss3Geral,
      bss4Geral,
      energiaTotal,
      cagConsumoKwh,
      cagConsumoM3,
      cagAguaDrenada,
      cagAguaLadrao,
      cagPctEnergia,
      cagPctAgua,
    });

    seriesAguaGeral.push({ date: d, value: aguaConsumoGeral });
    seriesBss1.push({ date: d, value: bss1Geral });
    seriesBss2.push({ date: d, value: bss2Geral });
    seriesBss3.push({ date: d, value: bss3Geral });
    seriesBss4.push({ date: d, value: bss4Geral });
    seriesCagKwh.push({ date: d, value: cagConsumoKwh });
    seriesCagM3.push({ date: d, value: cagConsumoM3 });
    seriesCagDrenada.push({ date: d, value: cagAguaDrenada });
  }

  // Monthly average maps (AVERAGEIF <> 0)
  const avgMapAguaGeral = buildMonthlyAverageMap(seriesAguaGeral);
  const avgMapBss1 = buildMonthlyAverageMap(seriesBss1);
  const avgMapBss2 = buildMonthlyAverageMap(seriesBss2);
  const avgMapBss3 = buildMonthlyAverageMap(seriesBss3);
  const avgMapBss4 = buildMonthlyAverageMap(seriesBss4);
  const avgMapCagKwh = buildMonthlyAverageMap(seriesCagKwh);
  const avgMapCagM3 = buildMonthlyAverageMap(seriesCagM3);
  const avgMapCagDrenada = buildMonthlyAverageMap(seriesCagDrenada);

  // Filter target dates (including full calendar 01/01..31/12 when filtered by year)
  let candidateDates = allDatesAsc;
  if (filters.year !== undefined && filters.includeFullCalendar !== false) {
    const calendarDates = generateCalendarDates(filters.year, filters.month);
    const merged = new Set<string>(calendarDates);
    for (const d of allDatesAsc) {
      const ym = parseYearMonth(d);
      if (!ym || ym.year !== filters.year) continue;
      if (filters.month !== undefined && ym.month !== filters.month) continue;
      merged.add(d);
    }
    candidateDates = Array.from(merged).sort((a, b) => a.localeCompare(b));
  }

  const targetDates = candidateDates.filter((d) => {
    const ym = parseYearMonth(d);
    if (!ym) return false;
    if (filters.year !== undefined && ym.year !== filters.year) return false;
    if (filters.month !== undefined && ym.month !== filters.month) return false;
    if (filters.startDate && d < filters.startDate) return false;
    if (filters.endDate && d > filters.endDate) return false;
    return true;
  });

  if (filters.sort === "desc") {
    targetDates.reverse();
  }

  const rows: PlanilhaRowDto[] = [];
  const searchLower = filters.search?.trim().toLowerCase() || "";

  for (const d of targetDates) {
    const ym = parseYearMonth(d)!;
    const daily = dailyByDate.get(d);
    const cells: Record<string, PlanilhaCellDto> = {};
    let hasPending = false;
    let highestAlertSeverity: AlertSeverity | null = null;

    const promoteSeverity = (sev: AlertSeverity | null | undefined) => {
      if (!sev) return;
      if (sev === "critical") {
        highestAlertSeverity = "critical";
      } else if (sev === "warning" && highestAlertSeverity !== "critical") {
        highestAlertSeverity = "warning";
      }
    };

    for (const col of visibleColumns) {
      if (col.kind === "KEY") {
        cells[col.key] = {
          column_key: col.key,
          kind: "KEY",
          value: d,
          formatted: formatDateBr(d),
          reading_id: null,
          meter_id: null,
          meter_code: null,
          status: null,
          alert_severity: null,
          is_anomaly: false,
          is_multi_day_delta: false,
          is_rollover: false,
          is_meter_replaced: false,
          has_photos: false,
          ocr_confidence: null,
          input_source: null,
        };
        continue;
      }

      if (col.kind === "INPUT" && col.meter_code) {
        const rec = readingByDateAndCode.get(`${d}::${col.meter_code}`);
        const meter = meterByCode.get(col.meter_code);
        const deltaInfo = deltaByDateAndCode.get(`${d}::${col.meter_code}`);

        let cellSeverity: AlertSeverity | null = null;
        if (rec && meter) {
          const persisted = alertSeverityByReadingId.get(rec.id) ?? null;
          const evaluated = evaluateReadingAlerts({
            meter,
            rawValue: rec.raw_value,
            previousValue: deltaInfo?.previousValue ?? null,
            isDropWithoutFlag: deltaInfo?.isDropWithoutFlag ?? false,
          });
          if (persisted === "critical" || evaluated.highestSeverity === "critical") {
            cellSeverity = "critical";
          } else if (
            persisted === "warning" ||
            evaluated.highestSeverity === "warning"
          ) {
            cellSeverity = "warning";
          }
          if (rec.status === "pending_review" || rec.status === "flagged") {
            hasPending = true;
          }
          promoteSeverity(cellSeverity);
        }

        const photoCount = rec ? (photoCountByReadingId[rec.id] ?? 0) : 0;

        cells[col.key] = {
          column_key: col.key,
          kind: "INPUT",
          value: rec ? rec.raw_value : null,
          formatted: rec ? formatNumberBr(rec.raw_value) : "-",
          reading_id: rec?.id ?? null,
          meter_id: meter?.id ?? rec?.meter_id ?? null,
          meter_code: col.meter_code,
          status: rec?.status ?? null,
          alert_severity: cellSeverity,
          is_anomaly: Boolean(deltaInfo?.isDropWithoutFlag),
          is_multi_day_delta: Boolean(deltaInfo?.isMultiDayDelta),
          is_rollover: rec?.is_rollover ?? false,
          is_meter_replaced: rec?.is_meter_replaced ?? false,
          has_photos: photoCount > 0,
          ocr_confidence: rec?.ocr_confidence ?? null,
          input_source: rec?.input_source ?? null,
        };
        continue;
      }

      if (col.kind === "CONFIG") {
        const meter = col.meter_code ? meterByCode.get(col.meter_code) : undefined;
        const teto =
          meter?.threshold?.teto_value ??
          meter?.threshold?.critical_min ??
          DEFAULT_TETOS[col.key] ??
          null;
        cells[col.key] = {
          column_key: col.key,
          kind: "CONFIG",
          value: teto,
          formatted: teto !== null ? formatNumberBr(teto, 0) : "-",
          reading_id: null,
          meter_id: meter?.id ?? null,
          meter_code: col.meter_code,
          status: null,
          alert_severity: null,
          is_anomaly: false,
          is_multi_day_delta: false,
          is_rollover: false,
          is_meter_replaced: false,
          has_photos: false,
          ocr_confidence: null,
          input_source: null,
        };
        continue;
      }

      // CALCULATED or REFERENCE_YOY
      let val: number | string | null = null;
      let formatted = "-";
      let isAnomaly = false;
      let isMultiDayDelta = false;
      let cellSeverity: AlertSeverity | null = null;

      switch (col.key) {
        case "calc_agua_consumo_geral": {
          val = daily?.aguaConsumoGeral ?? null;
          formatted = formatNumberBr(val);
          const dm = deltaByDateAndCode.get(`${d}::agua_hidrometro_geral`);
          isMultiDayDelta = Boolean(dm?.isMultiDayDelta);
          isAnomaly = Boolean(dm?.isDropWithoutFlag);
          if (isAnomaly) cellSeverity = "warning";
          break;
        }
        case "yoy_agua_consumo_geral":
          val = getMonthlyAvg(avgMapAguaGeral, ym.year - 1, ym.month);
          formatted = formatNumberBr(val);
          break;
        case "calc_agua_abastecimento_cisternas":
          val = daily?.aguaCisternasText ?? null;
          formatted = daily?.aguaCisternasText ?? "-";
          break;
        case "calc_agua_consumo_reuso": {
          val = daily?.aguaConsumoReuso ?? null;
          formatted = formatNumberBr(val);
          const dm = deltaByDateAndCode.get(`${d}::agua_reuso`);
          isMultiDayDelta = Boolean(dm?.isMultiDayDelta);
          isAnomaly = Boolean(dm?.isDropWithoutFlag);
          if (isAnomaly) cellSeverity = "warning";
          break;
        }
        case "calc_agua_consumo_muro_verde": {
          val = daily?.aguaConsumoMuroVerde ?? null;
          formatted = formatNumberBr(val);
          const dm = deltaByDateAndCode.get(`${d}::agua_muro_verde`);
          isMultiDayDelta = Boolean(dm?.isMultiDayDelta);
          isAnomaly = Boolean(dm?.isDropWithoutFlag);
          if (isAnomaly) cellSeverity = "warning";
          break;
        }
        case "calc_agua_consumo_calcadao": {
          val = daily?.aguaConsumoCalcadao ?? null;
          formatted = formatNumberBr(val);
          const dm = deltaByDateAndCode.get(`${d}::agua_irrigacao_calcadao`);
          isMultiDayDelta = Boolean(dm?.isMultiDayDelta);
          isAnomaly = Boolean(dm?.isDropWithoutFlag);
          if (isAnomaly) cellSeverity = "warning";
          break;
        }
        case "calc_temp_media_jockey":
          val = daily?.tempMediaJockey ?? null;
          formatted = formatNumberBr(val, 2);
          break;
        case "calc_temp_media_guaiba":
          val = daily?.tempMediaGuaiba ?? null;
          formatted = formatNumberBr(val, 2);
          break;
        case "calc_bss1_consumo_geral":
          val = daily?.bss1Geral ?? null;
          formatted = formatNumberBr(val);
          break;
        case "calc_bss1_media_mes":
          val = getMonthlyAvg(avgMapBss1, ym.year, ym.month);
          formatted = formatNumberBr(val);
          break;
        case "yoy_bss1_media_ano_anterior":
          val = getMonthlyAvg(avgMapBss1, ym.year - 1, ym.month);
          formatted = formatNumberBr(val);
          break;
        case "calc_bss2_consumo_geral":
          val = daily?.bss2Geral ?? null;
          formatted = formatNumberBr(val);
          break;
        case "calc_bss2_media_mes":
          val = getMonthlyAvg(avgMapBss2, ym.year, ym.month);
          formatted = formatNumberBr(val);
          break;
        case "yoy_bss2_media_ano_anterior":
          val = getMonthlyAvg(avgMapBss2, ym.year - 1, ym.month);
          formatted = formatNumberBr(val);
          break;
        case "calc_bss3_consumo_geral":
          val = daily?.bss3Geral ?? null;
          formatted = formatNumberBr(val);
          break;
        case "calc_bss3_media_mes":
          val = getMonthlyAvg(avgMapBss3, ym.year, ym.month);
          formatted = formatNumberBr(val);
          break;
        case "yoy_bss3_media_ano_anterior":
          val = getMonthlyAvg(avgMapBss3, ym.year - 1, ym.month);
          formatted = formatNumberBr(val);
          break;
        case "calc_bss4_consumo_geral":
          val = daily?.bss4Geral ?? null;
          formatted = formatNumberBr(val);
          break;
        case "calc_bss4_media_mes":
          val = getMonthlyAvg(avgMapBss4, ym.year, ym.month);
          formatted = formatNumberBr(val);
          break;
        case "yoy_bss4_media_ano_anterior":
          val = getMonthlyAvg(avgMapBss4, ym.year - 1, ym.month);
          formatted = formatNumberBr(val);
          break;
        case "calc_energia_consumo_total":
          val = daily?.energiaTotal ?? null;
          formatted = formatNumberBr(val);
          break;
        case "calc_cag_consumo_kwh": {
          val = daily?.cagConsumoKwh ?? null;
          formatted = formatNumberBr(val);
          const dm = deltaByDateAndCode.get(`${d}::cag_medidor_kwh`);
          isMultiDayDelta = Boolean(dm?.isMultiDayDelta);
          isAnomaly = Boolean(dm?.isDropWithoutFlag);
          if (isAnomaly) cellSeverity = "warning";
          break;
        }
        case "calc_cag_media_mes_kwh":
          val = getMonthlyAvg(avgMapCagKwh, ym.year, ym.month);
          formatted = formatNumberBr(val);
          break;
        case "yoy_cag_media_ano_anterior_kwh":
          val = getMonthlyAvg(avgMapCagKwh, ym.year - 1, ym.month);
          formatted = formatNumberBr(val);
          break;
        case "calc_cag_pct_energia":
          val = daily?.cagPctEnergia ?? null;
          formatted = formatPercentBr(daily?.cagPctEnergia ?? null);
          break;
        case "calc_cag_consumo_m3": {
          val = daily?.cagConsumoM3 ?? null;
          formatted = formatNumberBr(val);
          const dm = deltaByDateAndCode.get(`${d}::cag_medidor_m3`);
          isMultiDayDelta = Boolean(dm?.isMultiDayDelta);
          isAnomaly = Boolean(dm?.isDropWithoutFlag);
          if (isAnomaly) cellSeverity = "warning";
          break;
        }
        case "calc_cag_media_mes_m3":
          val = getMonthlyAvg(avgMapCagM3, ym.year, ym.month);
          formatted = formatNumberBr(val);
          break;
        case "yoy_cag_media_ano_anterior_m3":
          val = getMonthlyAvg(avgMapCagM3, ym.year - 1, ym.month);
          formatted = formatNumberBr(val);
          break;
        case "calc_cag_pct_agua": {
          val = daily?.cagPctAgua.ratio ?? null;
          formatted = daily?.cagPctAgua.display ?? "-";
          isAnomaly = daily?.cagPctAgua.isAnomaly ?? false;
          if (isAnomaly && daily) {
            const anom = evaluateCagWaterAnomaly(
              daily.cagConsumoM3,
              daily.aguaConsumoGeral,
            );
            if (anom) cellSeverity = anom.severity;
          }
          break;
        }
        case "calc_cag_agua_drenada": {
          val = daily?.cagAguaDrenada ?? null;
          formatted = formatNumberBr(val);
          const dm = deltaByDateAndCode.get(`${d}::cag_dreno_torre`);
          isMultiDayDelta = Boolean(dm?.isMultiDayDelta);
          isAnomaly = Boolean(dm?.isDropWithoutFlag);
          if (isAnomaly) cellSeverity = "warning";
          break;
        }
        case "yoy_cag_media_drenada_ano_anterior":
          val = getMonthlyAvg(avgMapCagDrenada, ym.year - 1, ym.month);
          formatted = formatNumberBr(val);
          break;
        case "calc_cag_agua_ladrao": {
          val = daily?.cagAguaLadrao ?? null;
          formatted = formatNumberBr(val);
          const dm = deltaByDateAndCode.get(`${d}::cag_ladrao_torre`);
          isMultiDayDelta = Boolean(dm?.isMultiDayDelta);
          isAnomaly = Boolean(dm?.isDropWithoutFlag);
          if (isAnomaly) cellSeverity = "warning";
          break;
        }
        default:
          break;
      }

      promoteSeverity(cellSeverity);

      cells[col.key] = {
        column_key: col.key,
        kind: col.kind,
        value: val,
        formatted,
        reading_id: null,
        meter_id: null,
        meter_code: col.meter_code,
        status: null,
        alert_severity: cellSeverity,
        is_anomaly: isAnomaly,
        is_multi_day_delta: isMultiDayDelta,
        is_rollover: false,
        is_meter_replaced: false,
        has_photos: false,
        ocr_confidence: null,
        input_source: null,
      };
    }

    if (filters.onlyPendingOrAlerts && !hasPending && !highestAlertSeverity) {
      continue;
    }

    if (searchLower) {
      const dateMatch =
        d.toLowerCase().includes(searchLower) ||
        formatDateBr(d).toLowerCase().includes(searchLower);
      const cellMatch = Object.values(cells).some((c) =>
        c.formatted.toLowerCase().includes(searchLower),
      );
      if (!dateMatch && !cellMatch) {
        continue;
      }
    }

    rows.push({
      reading_date: d,
      cells,
      has_pending: hasPending,
      highest_alert_severity: highestAlertSeverity,
    });
  }

  // Compute KPIs from the latest date with actual readings in the filtered rows (or latest overall)
  const rowsWithData = rows.filter((r) => dailyByDate.has(r.reading_date));
  const refDate =
    rowsWithData.length > 0
      ? (filters.sort === "desc"
          ? rowsWithData[0].reading_date
          : rowsWithData[rowsWithData.length - 1].reading_date)
      : allDatesAsc[allDatesAsc.length - 1] ?? null;

  const refDaily = refDate ? dailyByDate.get(refDate) : undefined;

  let pendingReviewCount = 0;
  for (const r of readings) {
    if (r.status === "pending_review" || r.status === "flagged") {
      pendingReviewCount += 1;
    }
  }

  const unackCritical = alerts.filter(
    (a) => a.severity === "critical" && !a.acknowledged_at,
  ).length;
  const unackWarning = alerts.filter(
    (a) => a.severity === "warning" && !a.acknowledged_at,
  ).length;

  const kpis: PlanilhaKpisDto = {
    reference_date: refDate,
    agua_consumo_geral_m3: refDaily?.aguaConsumoGeral ?? null,
    energia_consumo_total_kwh: refDaily?.energiaTotal ?? null,
    cag_percent_energia: refDaily?.cagPctEnergia ?? null,
    cag_percent_agua: refDaily?.cagPctAgua.ratio ?? null,
    pending_review_count: pendingReviewCount,
    active_critical_alerts_count: unackCritical,
    active_warning_alerts_count: unackWarning,
  };

  // Ensure allColumns reference stays valid even if unused
  void allColumns;

  return {
    columns: visibleColumns,
    rows,
    kpis,
    available_years: Array.from(yearSet).sort((a, b) => b - a),
    total_rows: rows.length,
  };
}
