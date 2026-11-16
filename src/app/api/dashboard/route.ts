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
  const requestedYear = yearParam ? Number(yearParam) : undefined;
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

    // Agrupar linhas por (ano, mes) e por ano
    const byYearMonth = new Map<string, PlanilhaRowDto[]>();
    const byYear = new Map<number, PlanilhaRowDto[]>();

    for (const row of projected.rows) {
      const y = Number(row.reading_date.slice(0, 4));
      const m = Number(row.reading_date.slice(5, 7));
      const ymKey = `${y}-${m}`;
      const ymList = byYearMonth.get(ymKey) ?? [];
      ymList.push(row);
      byYearMonth.set(ymKey, ymList);

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

    const currAnnual = annual_series.find((a) => a.year === selectedYear);
    const prevAnnual = annual_series.find((a) => a.year === previousYear);

    const aguaCurr = currAnnual?.agua_geral_m3 ?? 0;
    const aguaPrev = prevAnnual?.agua_geral_m3 ?? 0;
    const energiaCurr = currAnnual?.energia_total_kwh ?? 0;
    const energiaPrev = prevAnnual?.energia_total_kwh ?? 0;
    const cagEnergiaCurr = currAnnual?.cag_energia_kwh ?? 0;
    const cagEnergiaPrev = prevAnnual?.cag_energia_kwh ?? 0;
    const cagAguaCurr = currAnnual?.cag_agua_m3 ?? 0;
    const cagAguaPrev = prevAnnual?.cag_agua_m3 ?? 0;

    const unacknowledged = alerts.filter((a) => !a.acknowledged_at);
    const critical = unacknowledged.filter((a) => a.severity === "critical");

    const payload: DashboardResponse = {
      available_years: availableYears,
      selected_year: selectedYear,
      previous_year: previousYear,
      kpis: {
        agua_geral_m3: aguaCurr,
        agua_geral_yoy_pct: computeYoyPct(aguaCurr, aguaPrev),
        energia_total_kwh: energiaCurr,
        energia_total_yoy_pct: computeYoyPct(energiaCurr, energiaPrev),
        cag_energia_kwh: cagEnergiaCurr,
        cag_energia_yoy_pct: computeYoyPct(cagEnergiaCurr, cagEnergiaPrev),
        cag_agua_m3: cagAguaCurr,
        cag_agua_yoy_pct: computeYoyPct(cagAguaCurr, cagAguaPrev),
        temp_externa_avg: currAnnual?.temp_externa_avg ?? null,
        temp_jockey_avg: currAnnual?.temp_jockey_avg ?? null,
        temp_guaiba_avg: currAnnual?.temp_guaiba_avg ?? null,
        unacknowledged_alerts: unacknowledged.length,
        critical_alerts: critical.length,
      },
      monthly_series,
      annual_series,
      energy_sector_shares: [
        {
          key: "bss_1",
          label: "BSS 1",
          value: currAnnual?.bss1_kwh ?? 0,
          unit: "kWh",
          color: "#0284c7",
        },
        {
          key: "bss_2",
          label: "BSS 2",
          value: currAnnual?.bss2_kwh ?? 0,
          unit: "kWh",
          color: "#4f46e5",
        },
        {
          key: "bss_3",
          label: "BSS 3",
          value: currAnnual?.bss3_kwh ?? 0,
          unit: "kWh",
          color: "#7c3aed",
        },
        {
          key: "bss_4",
          label: "BSS 4",
          value: currAnnual?.bss4_kwh ?? 0,
          unit: "kWh",
          color: "#0d9488",
        },
        {
          key: "cag",
          label: "CAG (inclusa no total)",
          value: currAnnual?.cag_energia_kwh ?? 0,
          unit: "kWh",
          color: "#f59e0b",
        },
      ],
      water_sector_shares: [
        {
          key: "agua_geral",
          label: "Hidrômetro Geral",
          value: currAnnual?.agua_geral_m3 ?? 0,
          unit: "m³",
          color: "#0284c7",
        },
        {
          key: "agua_reuso",
          label: "Reuso (Est. Elevatória)",
          value: currAnnual?.agua_reuso_m3 ?? 0,
          unit: "m³",
          color: "#10b981",
        },
        {
          key: "agua_muro_verde",
          label: "Muro Verde",
          value: currAnnual?.agua_muro_verde_m3 ?? 0,
          unit: "m³",
          color: "#14b8a6",
        },
        {
          key: "agua_calcadao",
          label: "Irrigação Calçadão",
          value: currAnnual?.agua_calcadao_m3 ?? 0,
          unit: "m³",
          color: "#06b6d4",
        },
        {
          key: "cag_agua",
          label: "CAG Reposição",
          value: currAnnual?.cag_agua_m3 ?? 0,
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
