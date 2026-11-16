import { NextResponse } from "next/server";
import { projectNormalizedToSpreadsheet } from "@/domain/spreadsheet";
import { requireAuth } from "@/lib/supabase/auth";
import {
  getAllNormalizedReadingsAndPhotos,
  getCatalogData,
  listAlerts,
} from "@/lib/supabase/repository";
import type {
  DashboardAnnualPointDto,
  DashboardDailyPointDto,
  DashboardMonthlyPointDto,
  DashboardResponse,
  PlanilhaRowDto,
} from "@/types/contracts";

const MONTH_LABELS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

function numCell(row: PlanilhaRowDto, key: string): number | null {
  const val = row.cells[key]?.value;
  return typeof val === "number" && Number.isFinite(val) ? val : null;
}

function sumBucket(values: Array<number | null>): number {
  let total = 0;
  for (const v of values) {
    if (v !== null) total += v;
  }
  return Number(total.toFixed(2));
}

function avgBucket(values: Array<number | null>): number | null {
  let total = 0;
  let count = 0;
  for (const v of values) {
    if (v !== null) {
      total += v;
      count += 1;
    }
  }
  return count > 0 ? Number((total / count).toFixed(2)) : null;
}

function computeYoyPct(current: number, previous: number): number | null {
  if (previous <= 0 || current <= 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export async function GET(req: Request) {
  const auth = await requireAuth(req, "manager");
  if (auth.errorResponse) return auth.errorResponse;

  const url = new URL(req.url);
  const yearParam = url.searchParams.get("year");
  const monthParam = url.searchParams.get("month");
  const requestedYear = yearParam ? Number(yearParam) : undefined;
  const requestedMonth =
    monthParam && monthParam !== "all" ? Number(monthParam) : null;
  if (
    yearParam &&
    (!Number.isInteger(requestedYear) ||
      requestedYear! < 2000 ||
      requestedYear! > 2100)
  ) {
    return NextResponse.json(
      { error: "Parâmetro year inválido." },
      { status: 400 },
    );
  }
  if (
    requestedMonth !== null &&
    (!Number.isInteger(requestedMonth) ||
      requestedMonth < 1 ||
      requestedMonth > 12)
  ) {
    return NextResponse.json(
      { error: "Parâmetro month inválido." },
      { status: 400 },
    );
  }

  try {
    const catalog = await getCatalogData();
    const [{ readings, photoCountByReadingId }, alerts] = await Promise.all([
      getAllNormalizedReadingsAndPhotos(catalog.meters),
      listAlerts({ limit: 500 }),
    ]);

    const projected = projectNormalizedToSpreadsheet({
      meters: catalog.meters,
      readings,
      alerts,
      photoCountByReadingId,
      filters: {
        sort: "asc",
        includeFullCalendar: false,
      },
    });

    const availableYears =
      projected.available_years.length > 0
        ? projected.available_years
        : [new Date().getFullYear()];
    const selectedYear =
      requestedYear ?? availableYears[0] ?? new Date().getFullYear();
    const previousYear = selectedYear - 1;

    // Agrupar linhas por (ano, mes), por (ano, mes, dia) e por ano
    const byYearMonth = new Map<string, PlanilhaRowDto[]>();
    const byYearMonthDay = new Map<string, PlanilhaRowDto>();
    const byYear = new Map<number, PlanilhaRowDto[]>();

    for (const row of projected.rows) {
      const y = Number(row.reading_date.slice(0, 4));
      const m = Number(row.reading_date.slice(5, 7));
      const d = Number(row.reading_date.slice(8, 10));
      const ymKey = `${y}-${m}`;
      const ymList = byYearMonth.get(ymKey) ?? [];
      ymList.push(row);
      byYearMonth.set(ymKey, ymList);

      byYearMonthDay.set(`${y}-${m}-${d}`, row);

      const yList = byYear.get(y) ?? [];
      yList.push(row);
      byYear.set(y, yList);
    }

    const monthly_series: DashboardMonthlyPointDto[] = [];
    for (let m = 1; m <= 12; m += 1) {
      const currRows = byYearMonth.get(`${selectedYear}-${m}`) ?? [];
      const prevRows = byYearMonth.get(`${previousYear}-${m}`) ?? [];

      monthly_series.push({
        month: m,
        label: MONTH_LABELS[m - 1],
        agua_geral_m3: sumBucket(
          currRows.map((r) => numCell(r, "calc_agua_consumo_geral")),
        ),
        agua_geral_prev_m3: sumBucket(
          prevRows.map((r) => numCell(r, "calc_agua_consumo_geral")),
        ),
        agua_reuso_m3: sumBucket(
          currRows.map((r) => numCell(r, "calc_agua_consumo_reuso")),
        ),
        agua_muro_verde_m3: sumBucket(
          currRows.map((r) => numCell(r, "calc_agua_consumo_muro_verde")),
        ),
        agua_calcadao_m3: sumBucket(
          currRows.map((r) => numCell(r, "calc_agua_consumo_calcadao")),
        ),
        energia_total_kwh: sumBucket(
          currRows.map((r) => numCell(r, "calc_energia_consumo_total")),
        ),
        energia_total_prev_kwh: sumBucket(
          prevRows.map((r) => numCell(r, "calc_energia_consumo_total")),
        ),
        bss1_kwh: sumBucket(
          currRows.map((r) => numCell(r, "calc_bss1_consumo_geral")),
        ),
        bss2_kwh: sumBucket(
          currRows.map((r) => numCell(r, "calc_bss2_consumo_geral")),
        ),
        bss3_kwh: sumBucket(
          currRows.map((r) => numCell(r, "calc_bss3_consumo_geral")),
        ),
        bss4_kwh: sumBucket(
          currRows.map((r) => numCell(r, "calc_bss4_consumo_geral")),
        ),
        cag_energia_kwh: sumBucket(
          currRows.map((r) => numCell(r, "calc_cag_consumo_kwh")),
        ),
        cag_energia_prev_kwh: sumBucket(
          prevRows.map((r) => numCell(r, "calc_cag_consumo_kwh")),
        ),
        cag_agua_m3: sumBucket(
          currRows.map((r) => numCell(r, "calc_cag_consumo_m3")),
        ),
        cag_agua_prev_m3: sumBucket(
          prevRows.map((r) => numCell(r, "calc_cag_consumo_m3")),
        ),
        cag_condutivimetro_avg: avgBucket(
          currRows.map((r) => numCell(r, "cag_condutivimetro")),
        ),
        temp_externa_avg: avgBucket(
          currRows.map((r) => numCell(r, "temp_externa")),
        ),
        temp_jockey_avg: avgBucket(
          currRows.map((r) => numCell(r, "calc_temp_media_jockey")),
        ),
        temp_guaiba_avg: avgBucket(
          currRows.map((r) => numCell(r, "calc_temp_media_guaiba")),
        ),
        chiller1_motor_avg: avgBucket(
          currRows.map((r) => numCell(r, "chiller1_motor_pct")),
        ),
        chiller2_motor_avg: avgBucket(
          currRows.map((r) => numCell(r, "chiller2_motor_pct")),
        ),
      });
    }

    const yearsAsc = [...availableYears].sort((a, b) => a - b);
    const annual_series: DashboardAnnualPointDto[] = yearsAsc.map((y) => {
      const rows = byYear.get(y) ?? [];
      return {
        year: y,
        agua_geral_m3: sumBucket(
          rows.map((r) => numCell(r, "calc_agua_consumo_geral")),
        ),
        agua_reuso_m3: sumBucket(
          rows.map((r) => numCell(r, "calc_agua_consumo_reuso")),
        ),
        agua_muro_verde_m3: sumBucket(
          rows.map((r) => numCell(r, "calc_agua_consumo_muro_verde")),
        ),
        agua_calcadao_m3: sumBucket(
          rows.map((r) => numCell(r, "calc_agua_consumo_calcadao")),
        ),
        energia_total_kwh: sumBucket(
          rows.map((r) => numCell(r, "calc_energia_consumo_total")),
        ),
        bss1_kwh: sumBucket(
          rows.map((r) => numCell(r, "calc_bss1_consumo_geral")),
        ),
        bss2_kwh: sumBucket(
          rows.map((r) => numCell(r, "calc_bss2_consumo_geral")),
        ),
        bss3_kwh: sumBucket(
          rows.map((r) => numCell(r, "calc_bss3_consumo_geral")),
        ),
        bss4_kwh: sumBucket(
          rows.map((r) => numCell(r, "calc_bss4_consumo_geral")),
        ),
        cag_energia_kwh: sumBucket(
          rows.map((r) => numCell(r, "calc_cag_consumo_kwh")),
        ),
        cag_agua_m3: sumBucket(
          rows.map((r) => numCell(r, "calc_cag_consumo_m3")),
        ),
        temp_externa_avg: avgBucket(
          rows.map((r) => numCell(r, "temp_externa")),
        ),
        temp_jockey_avg: avgBucket(
          rows.map((r) => numCell(r, "calc_temp_media_jockey")),
        ),
        temp_guaiba_avg: avgBucket(
          rows.map((r) => numCell(r, "calc_temp_media_guaiba")),
        ),
      };
    });

    const daily_series: DashboardDailyPointDto[] = [];
    if (requestedMonth !== null) {
      const daysInMonth = new Date(
        Date.UTC(selectedYear, requestedMonth, 0),
      ).getUTCDate();
      const mm = String(requestedMonth).padStart(2, "0");
      for (let day = 1; day <= daysInMonth; day += 1) {
        const dd = String(day).padStart(2, "0");
        const currRow = byYearMonthDay.get(`${selectedYear}-${requestedMonth}-${day}`);
        const prevRow = byYearMonthDay.get(`${previousYear}-${requestedMonth}-${day}`);
        daily_series.push({
          day,
          label: dd,
          date: `${selectedYear}-${mm}-${dd}`,
          agua_geral_m3: currRow ? (numCell(currRow, "calc_agua_consumo_geral") ?? 0) : 0,
          agua_geral_prev_m3: prevRow ? (numCell(prevRow, "calc_agua_consumo_geral") ?? 0) : 0,
          agua_reuso_m3: currRow ? (numCell(currRow, "calc_agua_consumo_reuso") ?? 0) : 0,
          energia_total_kwh: currRow ? (numCell(currRow, "calc_energia_consumo_total") ?? 0) : 0,
          energia_total_prev_kwh: prevRow ? (numCell(prevRow, "calc_energia_consumo_total") ?? 0) : 0,
          bss1_kwh: currRow ? (numCell(currRow, "calc_bss1_consumo_geral") ?? 0) : 0,
          bss2_kwh: currRow ? (numCell(currRow, "calc_bss2_consumo_geral") ?? 0) : 0,
          bss3_kwh: currRow ? (numCell(currRow, "calc_bss3_consumo_geral") ?? 0) : 0,
          bss4_kwh: currRow ? (numCell(currRow, "calc_bss4_consumo_geral") ?? 0) : 0,
          cag_energia_kwh: currRow ? (numCell(currRow, "calc_cag_consumo_kwh") ?? 0) : 0,
          cag_energia_prev_kwh: prevRow ? (numCell(prevRow, "calc_cag_consumo_kwh") ?? 0) : 0,
          cag_agua_m3: currRow ? (numCell(currRow, "calc_cag_consumo_m3") ?? 0) : 0,
          cag_agua_prev_m3: prevRow ? (numCell(prevRow, "calc_cag_consumo_m3") ?? 0) : 0,
          cag_condutivimetro_avg: currRow ? numCell(currRow, "cag_condutivimetro") : null,
          temp_externa_avg: currRow ? numCell(currRow, "temp_externa") : null,
          temp_jockey_avg: currRow ? numCell(currRow, "calc_temp_media_jockey") : null,
          temp_guaiba_avg: currRow ? numCell(currRow, "calc_temp_media_guaiba") : null,
          chiller1_motor_avg: currRow ? numCell(currRow, "chiller1_motor_pct") : null,
          chiller2_motor_avg: currRow ? numCell(currRow, "chiller2_motor_pct") : null,
        });
      }
    }

    const currScopeRows =
      requestedMonth !== null
        ? (byYearMonth.get(`${selectedYear}-${requestedMonth}`) ?? [])
        : (byYear.get(selectedYear) ?? []);
    const prevScopeRows =
      requestedMonth !== null
        ? (byYearMonth.get(`${previousYear}-${requestedMonth}`) ?? [])
        : (byYear.get(previousYear) ?? []);

    const aguaCurr = sumBucket(currScopeRows.map((r) => numCell(r, "calc_agua_consumo_geral")));
    const aguaPrev = sumBucket(prevScopeRows.map((r) => numCell(r, "calc_agua_consumo_geral")));
    const aguaReusoCurr = sumBucket(currScopeRows.map((r) => numCell(r, "calc_agua_consumo_reuso")));
    const aguaMuroVerdeCurr = sumBucket(currScopeRows.map((r) => numCell(r, "calc_agua_consumo_muro_verde")));
    const aguaCalcadaoCurr = sumBucket(currScopeRows.map((r) => numCell(r, "calc_agua_consumo_calcadao")));

    const energiaCurr = sumBucket(currScopeRows.map((r) => numCell(r, "calc_energia_consumo_total")));
    const energiaPrev = sumBucket(prevScopeRows.map((r) => numCell(r, "calc_energia_consumo_total")));
    const bss1Curr = sumBucket(currScopeRows.map((r) => numCell(r, "calc_bss1_consumo_geral")));
    const bss2Curr = sumBucket(currScopeRows.map((r) => numCell(r, "calc_bss2_consumo_geral")));
    const bss3Curr = sumBucket(currScopeRows.map((r) => numCell(r, "calc_bss3_consumo_geral")));
    const bss4Curr = sumBucket(currScopeRows.map((r) => numCell(r, "calc_bss4_consumo_geral")));

    const cagEnergiaCurr = sumBucket(currScopeRows.map((r) => numCell(r, "calc_cag_consumo_kwh")));
    const cagEnergiaPrev = sumBucket(prevScopeRows.map((r) => numCell(r, "calc_cag_consumo_kwh")));
    const cagAguaCurr = sumBucket(currScopeRows.map((r) => numCell(r, "calc_cag_consumo_m3")));
    const cagAguaPrev = sumBucket(prevScopeRows.map((r) => numCell(r, "calc_cag_consumo_m3")));

    const tempExternaScope = avgBucket(currScopeRows.map((r) => numCell(r, "temp_externa")));
    const tempJockeyScope = avgBucket(currScopeRows.map((r) => numCell(r, "calc_temp_media_jockey")));
    const tempGuaibaScope = avgBucket(currScopeRows.map((r) => numCell(r, "calc_temp_media_guaiba")));

    const unacknowledged = alerts.filter((a) => !a.acknowledged_at);
    const critical = unacknowledged.filter((a) => a.severity === "critical");

    const payload: DashboardResponse = {
      available_years: availableYears,
      selected_year: selectedYear,
      previous_year: previousYear,
      selected_month: requestedMonth,
      kpis: {
        agua_geral_m3: aguaCurr,
        agua_geral_yoy_pct: computeYoyPct(aguaCurr, aguaPrev),
        energia_total_kwh: energiaCurr,
        energia_total_yoy_pct: computeYoyPct(energiaCurr, energiaPrev),
        cag_energia_kwh: cagEnergiaCurr,
        cag_energia_yoy_pct: computeYoyPct(cagEnergiaCurr, cagEnergiaPrev),
        cag_agua_m3: cagAguaCurr,
        cag_agua_yoy_pct: computeYoyPct(cagAguaCurr, cagAguaPrev),
        temp_externa_avg: tempExternaScope,
        temp_jockey_avg: tempJockeyScope,
        temp_guaiba_avg: tempGuaibaScope,
        unacknowledged_alerts: unacknowledged.length,
        critical_alerts: critical.length,
      },
      monthly_series,
      daily_series,
      annual_series,
      energy_sector_shares: [
        {
          key: "bss_1",
          label: "BSS 1",
          value: bss1Curr,
          unit: "kWh",
          color: "#0284c7",
        },
        {
          key: "bss_2",
          label: "BSS 2",
          value: bss2Curr,
          unit: "kWh",
          color: "#4f46e5",
        },
        {
          key: "bss_3",
          label: "BSS 3",
          value: bss3Curr,
          unit: "kWh",
          color: "#7c3aed",
        },
        {
          key: "bss_4",
          label: "BSS 4",
          value: bss4Curr,
          unit: "kWh",
          color: "#0d9488",
        },
        {
          key: "cag",
          label: "CAG (inclusa no total)",
          value: cagEnergiaCurr,
          unit: "kWh",
          color: "#f59e0b",
        },
      ],
      water_sector_shares: [
        {
          key: "agua_geral",
          label: "Hidrômetro Geral",
          value: aguaCurr,
          unit: "m³",
          color: "#0284c7",
        },
        {
          key: "agua_reuso",
          label: "Reuso (Est. Elevatória)",
          value: aguaReusoCurr,
          unit: "m³",
          color: "#10b981",
        },
        {
          key: "agua_muro_verde",
          label: "Muro Verde",
          value: aguaMuroVerdeCurr,
          unit: "m³",
          color: "#14b8a6",
        },
        {
          key: "agua_calcadao",
          label: "Irrigação Calçadão",
          value: aguaCalcadaoCurr,
          unit: "m³",
          color: "#06b6d4",
        },
        {
          key: "cag_agua",
          label: "CAG Reposição",
          value: cagAguaCurr,
          unit: "m³",
          color: "#6366f1",
        },
      ],
    };

    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Erro ao carregar dados do dashboard.",
      },
      { status: 500 },
    );
  }
}
