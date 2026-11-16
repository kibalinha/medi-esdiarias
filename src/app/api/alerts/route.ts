import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/supabase/auth";
import { acknowledgeAlert, listAlerts } from "@/lib/supabase/repository";
import type { AlertsListResponse } from "@/types/contracts";

const AcknowledgeSchema = z.object({
  alert_id: z.string().uuid(),
  acknowledge: z.boolean(),
});

export async function GET(req: Request) {
  const auth = await requireAuth(req, "manager");
  if (auth.errorResponse) return auth.errorResponse;

  const url = new URL(req.url);
  const sevParam = url.searchParams.get("severity");
  const ackParam = url.searchParams.get("acknowledged");
  const unackParam = url.searchParams.get("unacknowledged");
  const limitParam = url.searchParams.get("limit");

  const severity =
    sevParam === "warning" || sevParam === "critical" ? sevParam : undefined;
  let acknowledged =
    ackParam === "true" ? true : ackParam === "false" ? false : undefined;
  if (unackParam === "1" || unackParam === "true") {
    acknowledged = false;
  } else if (unackParam === "0" || unackParam === "false") {
    acknowledged = true;
  }
  const limit = limitParam ? Number(limitParam) : 100;

  try {
    const [alerts, allUnack] = await Promise.all([
      listAlerts({ severity, acknowledged, limit }),
      listAlerts({ acknowledged: false, limit: 500 }),
    ]);

    const body: AlertsListResponse = {
      alerts,
      counts: {
        critical: allUnack.filter((a) => a.severity === "critical").length,
        warning: allUnack.filter((a) => a.severity === "warning").length,
        unacknowledged: allUnack.length,
      },
    };
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Erro ao listar alertas.",
      },
      { status: 500 },
    );
  }
}

async function handleAck(req: Request) {
  const auth = await requireAuth(req, "manager");
  if (auth.errorResponse) return auth.errorResponse;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = AcknowledgeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const alert = await acknowledgeAlert(
      parsed.data.alert_id,
      parsed.data.acknowledge,
      auth.user,
    );
    return NextResponse.json({ alert });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao atualizar alerta.";
    return NextResponse.json(
      { error: msg },
      { status: msg.includes("não encontrado") ? 404 : 500 },
    );
  }
}

export async function PATCH(req: Request) {
  return handleAck(req);
}

export async function POST(req: Request) {
  return handleAck(req);
}
