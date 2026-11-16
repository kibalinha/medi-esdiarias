import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/supabase/auth";
import { getCatalogData, updateCatalog } from "@/lib/supabase/repository";

const CatalogUpdateSchema = z.object({
  group_updates: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        display_order: z.number().int().optional(),
        is_active_in_field: z.boolean().optional(),
        allow_batch_photo: z.boolean().optional(),
      }),
    )
    .optional(),
  meter_updates: z
    .array(
      z.object({
        id: z.string().uuid(),
        label: z.string().min(1).optional(),
        unit: z.string().nullable().optional(),
        multiplier_factor: z.number().positive().optional(),
        dial_capacity: z.number().positive().nullable().optional(),
        photo_required: z.boolean().optional(),
        is_active_in_field: z.boolean().optional(),
        is_active_in_sheet: z.boolean().optional(),
        sort_order: z.number().int().optional(),
        ocr_hint: z.string().nullable().optional(),
      }),
    )
    .optional(),
  threshold_updates: z
    .array(
      z.object({
        meter_id: z.string().uuid(),
        warning_min: z.number().nullable().optional(),
        critical_min: z.number().nullable().optional(),
        teto_value: z.number().nullable().optional(),
      }),
    )
    .optional(),
  new_meter: z
    .object({
      group_id: z.string().uuid(),
      code: z.string().min(2).regex(/^[a-z0-9_]+$/),
      excel_header: z.string().min(1),
      label: z.string().min(1),
      unit: z.string().nullable().optional(),
      reading_kind: z.enum([
        "cumulative",
        "instant",
        "temperature",
        "hours",
        "quality",
      ]),
      multiplier_factor: z.number().positive().optional(),
      dial_capacity: z.number().positive().nullable().optional(),
      photo_required: z.boolean().optional(),
      is_active_in_field: z.boolean().optional(),
      is_active_in_sheet: z.boolean().optional(),
      sort_order: z.number().int().optional(),
      ocr_hint: z.string().nullable().optional(),
    })
    .optional(),
  user_updates: z
    .array(
      z.object({
        id: z.string().uuid(),
        role: z.enum(["technician", "manager"]).optional(),
        active: z.boolean().optional(),
        full_name: z.string().min(1).optional(),
        restrict_groups: z.boolean().optional(),
        allowed_group_ids: z.array(z.string().uuid()).optional(),
      }),
    )
    .optional(),
  new_user: z
    .object({
      email: z.string().email(),
      password: z.string().min(6),
      full_name: z.string().min(1),
      role: z.enum(["technician", "manager"]),
      restrict_groups: z.boolean().optional(),
      allowed_group_ids: z.array(z.string().uuid()).optional(),
    })
    .optional(),
});

export async function GET(req: Request) {
  const auth = await requireAuth(req, "manager");
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const catalog = await getCatalogData();
    if (auth.user.role !== "manager") {
      return NextResponse.json({
        groups: catalog.groups,
        meters: catalog.meters,
      });
    }
    return NextResponse.json(catalog);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Erro ao carregar catálogo.",
      },
      { status: 500 },
    );
  }
}

async function handlePatch(req: Request) {
  const auth = await requireAuth(req, "manager");
  if (auth.errorResponse) return auth.errorResponse;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = CatalogUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload de catálogo inválido.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const updated = await updateCatalog(parsed.data, auth.user);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Erro ao atualizar catálogo.",
      },
      { status: 400 },
    );
  }
}

export async function PATCH(req: Request) {
  return handlePatch(req);
}

export async function PUT(req: Request) {
  return handlePatch(req);
}
