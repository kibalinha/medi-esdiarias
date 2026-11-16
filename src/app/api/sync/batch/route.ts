import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/supabase/auth";
import { syncBatchMutations } from "@/lib/supabase/repository";

const SyncPhotoSchema = z.object({
  local_photo_id: z.string().min(1),
  data_base64: z.string().min(1),
  mime_type: z.string().min(1).default("image/webp"),
  captured_at: z.string().min(1),
  run_ocr: z.boolean().optional(),
  group_slug: z.string().optional(),
  meter_codes: z.array(z.string()).optional(),
});

const SyncMutationSchema = z.object({
  client_mutation_id: z.string().uuid(),
  reading_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meter_id: z.string().optional(),
  meter_code: z.string().min(1),
  raw_value: z.number().finite(),
  input_source: z.enum(["ocr", "manual", "ocr_edited", "xlsx_import"]),
  ocr_suggested_value: z.number().finite().nullable().optional(),
  ocr_confidence: z.number().min(0).max(1).nullable().optional(),
  is_rollover: z.boolean().optional(),
  is_meter_replaced: z.boolean().optional(),
  replacement_baseline: z.number().finite().nullable().optional(),
  notes: z.string().nullable().optional(),
  local_photo_ids: z.array(z.string()).optional(),
  photo_ids: z.array(z.string()).optional(),
  captured_at: z.string().optional(),
});

const SyncBatchSchema = z.object({
  photos: z.array(SyncPhotoSchema).optional(),
  mutations: z.array(SyncMutationSchema),
});

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth.errorResponse) return auth.errorResponse;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = SyncBatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload de sincronização inválido.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await syncBatchMutations(parsed.data, auth.user);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Erro ao sincronizar lote de leituras.",
      },
      { status: 500 },
    );
  }
}
