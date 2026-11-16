import { NextResponse } from "next/server";
import {
  exportSpreadsheetToCsv,
  exportSpreadsheetToXlsxBuffer,
  projectNormalizedToSpreadsheet,
} from "@/domain/spreadsheet";
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
  const format = (url.searchParams.get("format") || "xlsx").toLowerCase();
  const year = yearStr ? Number(yearStr) : undefined;

  if (yearStr && (!Number.isInteger(year) || year! < 2000 || year! > 2100)) {
    return NextResponse.json({ error: "Parâmetro year inválido." }, { status: 400 });
  }

  try {
    const catalog = await getCatalogData();
    const [{ readings, photoCountByReadingId }, alerts] = await Promise.all([
      getAllNormalizedReadingsAndPhotos(catalog.meters),
      listAlerts({ limit: 500 }),
    ]);

    if (format === "csv") {
      const projected = projectNormalizedToSpreadsheet({
        meters: catalog.meters,
        readings,
        alerts,
        photoCountByReadingId,
        filters: { year, sort: "asc" },
      });
      const csv = exportSpreadsheetToCsv(projected);
      const filename = `medicoes_diarias_${year ?? "historico"}.csv`;
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    const buffer = await exportSpreadsheetToXlsxBuffer({
      meters: catalog.meters,
      readings,
      year,
    });
    const filename = `medicoes_diarias_${year ?? "historico"}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Erro ao exportar planilha.",
      },
      { status: 500 },
    );
  }
}
