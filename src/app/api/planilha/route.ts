import { NextResponse } from "next/server";
import { projectNormalizedToSpreadsheet } from "@/domain/spreadsheet";
import { requireAuth } from "@/lib/supabase/auth";
import {
  getAllNormalizedReadingsAndPhotos,
  getCatalogData,
  listAlerts,
} from "@/lib/supabase/repository";

export async function GET(req: Request) {
  const auth = await requireAuth(req, "manager");
  if (auth.errorResponse) return auth.errorResponse;

  const url = new URL(req.url);
  const yearStr = url.searchParams.get("year");
  const monthStr = url.searchParams.get("month");
  const group = url.searchParams.get("group") || undefined;
  const search = url.searchParams.get("search") || undefined;
  const rawOnlyPending = url.searchParams.get("only_pending_or_alerts");
  const onlyPending = rawOnlyPending === "true" || rawOnlyPending === "1";
  const startDate = url.searchParams.get("start_date") || undefined;
  const endDate = url.searchParams.get("end_date") || undefined;
  const sort = url.searchParams.get("sort") === "desc" ? "desc" : "asc";

  const year = yearStr ? Number(yearStr) : undefined;
  const month = monthStr ? Number(monthStr) : undefined;

  if (yearStr && (!Number.isInteger(year) || year! < 2000 || year! > 2100)) {
    return NextResponse.json({ error: "Parâmetro year inválido." }, { status: 400 });
  }
  if (monthStr && (!Number.isInteger(month) || month! < 1 || month! > 12)) {
    return NextResponse.json({ error: "Parâmetro month inválido." }, { status: 400 });
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
        year,
        month,
        group,
        search,
        onlyPendingOrAlerts: onlyPending,
        startDate,
        endDate,
        sort,
        includeFullCalendar: year !== undefined,
      },
    });

    return NextResponse.json(projected);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Erro ao projetar dados da planilha.",
      },
      { status: 500 },
    );
  }
}
