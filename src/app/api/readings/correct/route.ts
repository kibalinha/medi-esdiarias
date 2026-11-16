import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/supabase/auth";
import { correctReading } from "@/lib/supabase/repository";

const CorrectReadingSchema = z
  .object({
    reading_id: z.string().uuid().optional(),
    reading_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "reading_date deve ser YYYY-MM-DD.")
      .optional(),
    meter_code: z.string().min(1).optional(),
    new_value: z.number().finite().optional(),
    raw_value: z.number().finite().optional(),
    reason: z.string().trim().optional(),
    is_rollover: z.boolean().optional(),
    is_meter_replaced: z.boolean().optional(),
    replacement_baseline: z.number().finite().nullable().optional(),
  })
  .refine(
    (d) => Boolean(d.reading_id) || (Boolean(d.reading_date) && Boolean(d.meter_code)),
    {
      message: "Informe reading_id ou (reading_date + meter_code).",
    },
  )
  .refine(
    (d) => d.new_value !== undefined || d.raw_value !== undefined,
    {
      message: "Informe new_value ou raw_value.",
    },
  );

export async function POST(req: Request) {
  // Strictly manager-only; calculated/reference/config columns cannot be edited
  const auth = await requireAuth(req, "manager");
  if (auth.errorResponse) return auth.errorResponse;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = CorrectReadingSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload de correção inválido.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await correctReading(parsed.data, auth.user);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao corrigir leitura.";
    const status = msg.includes("não encontrada") ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
