import { NextResponse } from "next/server";
import { computeCumulativeDelta } from "@/domain/calculations";
import { projectNormalizedToSpreadsheet } from "@/domain/spreadsheet";
import { requireAuth } from "@/lib/supabase/auth";
import {
  getAllNormalizedReadingsAndPhotos,
  getCatalogData,
  listAlerts,
} from "@/lib/supabase/repository";

function extractBiApiKey(req: Request): string | null {
  const url = new URL(req.url);
  const queryKey = url.searchParams.get("api_key");
  if (queryKey) return queryKey.trim();

  const headerKey = req.headers.get("x-api-key");
  if (headerKey) return headerKey.trim();

  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return null;
}

async function authorizeBiRequest(req: Request): Promise<NextResponse | null> {
  const configuredKey = process.env.BI_API_KEY;
  const providedKey = extractBiApiKey(req);

  if (
    configuredKey &&
    configuredKey !== "your-bi-api-key" &&
    providedKey &&
    providedKey === configuredKey
  ) {
    return null;
  }

  const auth = await requireAuth(req, "manager");
  if (!auth.errorResponse) {
    return null;
  }

  return NextResponse.json(
    {
      error:
        "Não autorizado. Informe ?api_key=... (ou header Authorization: Bearer <BI_API_KEY>) ou autentique-se como gestor.",
      code: "UNAUTHORIZED",
    },
    { status: 401 },
  );
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvResponse(
  rows: Array<Record<string, unknown>>,
  filename: string,
): NextResponse {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const lines: string[] = [];
  if (headers.length > 0) {
    lines.push(headers.map(escapeCsvCell).join(","));
    for (const row of rows) {
      lines.push(headers.map((h) => escapeCsvCell(row[h])).join(","));
    }
  }
  const csvWithBom = `\uFEFF${lines.join("\r\n")}`;
  return new NextResponse(csvWithBom, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Total-Count": String(rows.length),
    },
  });
}

export async function GET(req: Request) {
  const unauthorized = await authorizeBiRequest(req);
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "wide" ? "wide" : "normalized";
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const yearStr = url.searchParams.get("year");
  const startDate = url.searchParams.get("start_date") || undefined;
  const endDate = url.searchParams.get("end_date") || undefined;
  const groupSlug = url.searchParams.get("group") || undefined;

  const year = yearStr && yearStr !== "all" ? Number(yearStr) : undefined;
  if (
    yearStr &&
    yearStr !== "all" &&
    (!Number.isInteger(year) || year! < 2000 || year! > 2100)
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
      listAlerts({ limit: 1000 }),
    ]);

    if (mode === "wide") {
      const projected = projectNormalizedToSpreadsheet({
        meters: catalog.meters,
        readings,
        alerts,
        photoCountByReadingId,
        filters: {
          year,
          group: groupSlug,
          startDate,
          endDate,
          sort: "asc",
        },
      });

      const wideRows = projected.rows.map((row) => {
        const flat: Record<string, unknown> = {
          data: row.reading_date,
          ano: Number(row.reading_date.slice(0, 4)),
          mes: Number(row.reading_date.slice(5, 7)),
          dia: Number(row.reading_date.slice(8, 10)),
        };
        for (const col of projected.columns) {
          if (col.key === "data") continue;
          const cell = row.cells[col.key];
          flat[col.key] = cell ? cell.value : null;
        }
        return flat;
      });

      if (format === "csv") {
        return toCsvResponse(
          wideRows,
          `medicoes-bi-wide-${year ?? "todos"}.csv`,
        );
      }

      return NextResponse.json(wideRows, {
        headers: {
          "Cache-Control": "no-store",
          "X-Total-Count": String(wideRows.length),
        },
      });
    }

    // Modo padrão: normalized (modelo estrela / fato para Power BI)
    const groupById = new Map(catalog.groups.map((g) => [g.id, g]));
    const meterByCode = new Map(catalog.meters.map((m) => [m.code, m]));

    // Ordenar ascendente por medidor e data para calcular delta acumulativo corretamente
    const sorted = [...readings].sort((a, b) => {
      if (a.meter_code !== b.meter_code) {
        return a.meter_code.localeCompare(b.meter_code);
      }
      return a.reading_date.localeCompare(b.reading_date);
    });

    const prevByMeter = new Map<
      string,
      { reading_date: string; raw_value: number }
    >();
    const normalizedRows: Array<Record<string, unknown>> = [];

    for (const r of sorted) {
      const meter = meterByCode.get(r.meter_code);
      if (!meter) continue;
      if (groupSlug && meter.group_slug !== groupSlug) continue;

      const prev = prevByMeter.get(r.meter_code) ?? null;
      let calculatedConsumption: number | null = null;
      if (meter.reading_kind === "cumulative") {
        const res = computeCumulativeDelta({
          currentValue: r.raw_value,
          previousValue: prev?.raw_value ?? null,
          currentDate: r.reading_date,
          previousDate: prev?.reading_date ?? null,
          multiplierFactor: meter.multiplier_factor,
          dialCapacity: meter.dial_capacity,
          isRollover: r.is_rollover,
          isMeterReplaced: r.is_meter_replaced,
          replacementBaseline: r.replacement_baseline,
        });
        calculatedConsumption = res.delta;
      }

      prevByMeter.set(r.meter_code, {
        reading_date: r.reading_date,
        raw_value: r.raw_value,
      });

      if (year && Number(r.reading_date.slice(0, 4)) !== year) continue;
      if (startDate && r.reading_date < startDate) continue;
      if (endDate && r.reading_date > endDate) continue;

      const group = groupById.get(meter.group_id);
      normalizedRows.push({
        data: r.reading_date,
        ano: Number(r.reading_date.slice(0, 4)),
        mes: Number(r.reading_date.slice(5, 7)),
        dia: Number(r.reading_date.slice(8, 10)),
        setor_slug: meter.group_slug,
        setor_nome: group?.name ?? meter.group_slug,
        medidor_codigo: meter.code,
        medidor_nome: meter.label,
        unidade: meter.unit ?? "",
        tipo_leitura: meter.reading_kind,
        valor_bruto: r.raw_value,
        consumo_calculado: calculatedConsumption,
        status: r.status,
        origem: r.input_source,
        virada_medidor: r.is_rollover,
        troca_medidor: r.is_meter_replaced,
      });
    }

    if (format === "csv") {
      return toCsvResponse(
        normalizedRows,
        `medicoes-bi-normalized-${year ?? "todos"}.csv`,
      );
    }

    return NextResponse.json(normalizedRows, {
      headers: {
        "Cache-Control": "no-store",
        "X-Total-Count": String(normalizedRows.length),
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Erro ao gerar feed de dados para BI.",
      },
      { status: 500 },
    );
  }
}
