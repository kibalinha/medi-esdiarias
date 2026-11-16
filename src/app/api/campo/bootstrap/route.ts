import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import {
  getCatalogData,
  getPreviousReadingsBefore,
  getReadingsForDate,
  listAlerts,
} from "@/lib/supabase/repository";
import type { CampoBootstrapResponse } from "@/types/contracts";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth.errorResponse) return auth.errorResponse;

  const url = new URL(req.url);
  const dateParam =
    url.searchParams.get("date") || new Date().toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json(
      { error: "Parâmetro date inválido. Use YYYY-MM-DD." },
      { status: 400 },
    );
  }

  try {
    const catalog = await getCatalogData();
    const matchedCatalogUser = catalog.users?.find(
      (u) => u.id === auth.user.id || u.email === auth.user.email,
    );
    const restrictGroups =
      auth.user.restrict_groups ?? matchedCatalogUser?.restrict_groups ?? false;
    const allowedGroupIds =
      auth.user.allowed_group_ids ?? matchedCatalogUser?.allowed_group_ids ?? [];
    const allowedGroupSet = restrictGroups ? new Set(allowedGroupIds) : null;

    const activeGroups = catalog.groups.filter(
      (g) => g.is_active_in_field && (!allowedGroupSet || allowedGroupSet.has(g.id)),
    );
    const activeGroupIds = new Set(activeGroups.map((g) => g.id));
    const activeMeters = catalog.meters.filter(
      (m) => m.is_active_in_field && activeGroupIds.has(m.group_id),
    );

    const [previous_readings, existing_readings_today, active_alerts] =
      await Promise.all([
        getPreviousReadingsBefore(dateParam, activeMeters),
        getReadingsForDate(dateParam, activeMeters),
        listAlerts({ acknowledged: false, limit: 50 }),
      ]);

    const body: CampoBootstrapResponse = {
      date: dateParam,
      user: auth.user,
      groups: activeGroups,
      meters: activeMeters,
      previous_readings,
      existing_readings_today,
      active_alerts,
    };

    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Erro ao carregar bootstrap.",
      },
      { status: 500 },
    );
  }
}
