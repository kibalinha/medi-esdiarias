import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/supabase/auth";
import { getReadingDetail, reviewReading } from "@/lib/supabase/repository";

const ReviewSchema = z.object({
  reading_id: z.string().uuid(),
  action: z.enum(["approve", "flag"]),
  reason: z.string().optional(),
});

export async function GET(req: Request) {
  const auth = await requireAuth(req, "manager");
  if (auth.errorResponse) return auth.errorResponse;

  const url = new URL(req.url);
  const readingId = url.searchParams.get("reading_id");
  if (!readingId) {
    return NextResponse.json(
      { error: "Parâmetro reading_id obrigatório." },
      { status: 400 },
    );
  }

  try {
    const detail = await getReadingDetail(readingId);
    if (!detail) {
      return NextResponse.json(
        { error: "Leitura não encontrada." },
        { status: 404 },
      );
    }
    return NextResponse.json(detail);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Erro ao inspecionar leitura.",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const auth = await requireAuth(req, "manager");
  if (auth.errorResponse) return auth.errorResponse;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = ReviewSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload de revisão inválido.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await reviewReading(parsed.data, auth.user);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao revisar leitura.";
    const status = msg.includes("não encontrada") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
