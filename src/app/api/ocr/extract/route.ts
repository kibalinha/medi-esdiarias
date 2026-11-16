import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { extractMeterReadings } from "@/lib/ocr";
import { requireAuth } from "@/lib/supabase/auth";
import { getDataMode } from "@/lib/supabase/config";
import { getLocalDb, saveLocalDb } from "@/lib/supabase/local-store";
import {
  getCatalogData,
  getPreviousReadingsBefore,
} from "@/lib/supabase/repository";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { uploadFieldPhotoToStorage } from "@/lib/supabase/storage";
import type { MeterDto, OcrExtractResponse } from "@/types/contracts";

const OcrJsonSchema = z.object({
  image_base64: z.string().min(1),
  mime_type: z
    .enum(["image/webp", "image/jpeg", "image/png"])
    .optional()
    .default("image/webp"),
  group_slug: z.string().min(1),
  meter_ids: z.array(z.string()).optional(),
  meter_codes: z.array(z.string()).optional(),
  reading_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    let imageBase64 = "";
    let mimeType = "image/webp";
    let groupSlug = "";
    let meterIds: string[] | undefined;
    let meterCodes: string[] | undefined;
    let readingDate = new Date().toISOString().slice(0, 10);

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "Campo file obrigatório no multipart/form-data." },
          { status: 400 },
        );
      }
      const arrBuf = await file.arrayBuffer();
      imageBase64 = Buffer.from(arrBuf).toString("base64");
      mimeType = file.type || "image/webp";
      groupSlug = String(formData.get("group_slug") || "");
      const rawIds = formData.get("meter_ids");
      if (typeof rawIds === "string" && rawIds) {
        meterIds = JSON.parse(rawIds);
      }
      const rawCodes = formData.get("meter_codes");
      if (typeof rawCodes === "string" && rawCodes) {
        meterCodes = JSON.parse(rawCodes);
      }
      const rawDate = formData.get("reading_date");
      if (typeof rawDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        readingDate = rawDate;
      }
    } else {
      const json = await req.json();
      const parsed = OcrJsonSchema.safeParse(json);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Payload OCR inválido.", details: parsed.error.flatten() },
          { status: 400 },
        );
      }
      imageBase64 = parsed.data.image_base64;
      mimeType = parsed.data.mime_type;
      groupSlug = parsed.data.group_slug;
      meterIds = parsed.data.meter_ids;
      meterCodes = parsed.data.meter_codes;
      if (parsed.data.reading_date) readingDate = parsed.data.reading_date;
    }

    const catalog = await getCatalogData();
    let targetMeters: MeterDto[] = [];
    if (meterIds && meterIds.length > 0) {
      const idSet = new Set(meterIds);
      targetMeters = catalog.meters.filter((m) => idSet.has(m.id));
    } else if (meterCodes && meterCodes.length > 0) {
      const codeSet = new Set(meterCodes);
      targetMeters = catalog.meters.filter((m) => codeSet.has(m.code));
    } else {
      targetMeters = catalog.meters.filter(
        (m) => m.group_slug === groupSlug && m.is_active_in_field,
      );
    }

    if (targetMeters.length === 0) {
      return NextResponse.json(
        { error: "Nenhum medidor correspondente encontrado para OCR." },
        { status: 400 },
      );
    }

    const prevMap = await getPreviousReadingsBefore(readingDate, targetMeters);

    const ocrOut = await extractMeterReadings({
      imageBase64,
      mimeType,
      groupSlug,
      meters: targetMeters.map((meter) => ({
        meter,
        previousValue: prevMap[meter.code]?.raw_value ?? null,
      })),
    });

    // Persist photo record so frontend can link photo_id directly on save
    const photoId = crypto.randomUUID();
    const ext = mimeType.includes("png")
      ? "png"
      : mimeType.includes("jpeg") || mimeType.includes("jpg")
        ? "jpg"
        : "webp";
    const storagePath = `${readingDate.replace(/-/g, "/")}/${photoId}.${ext}`;
    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "");

    await uploadFieldPhotoToStorage({
      storagePath,
      buffer: Buffer.from(cleanBase64, "base64"),
      contentType: mimeType,
    });

    if (getDataMode() === "local") {
      const db = getLocalDb();
      const dataUrl = imageBase64.startsWith("data:")
        ? imageBase64
        : `data:${mimeType};base64,${cleanBase64}`;
      db.photos.push({
        id: photoId,
        storage_path: storagePath,
        data_url: dataUrl,
        captured_at: new Date().toISOString(),
        uploaded_by: auth.user.id,
        ocr_raw_response: ocrOut.rawResponse,
        ocr_status: "processed",
      });
      saveLocalDb(db);
    } else {
      const admin = createSupabaseAdminClient();
      if (admin) {
        await admin.from("field_photos").insert({
          id: photoId,
          storage_path: storagePath,
          captured_at: new Date().toISOString(),
          uploaded_by: auth.user.id,
          ocr_raw_response: ocrOut.rawResponse as never,
          ocr_status: "processed",
        });
      }
    }

    const body: OcrExtractResponse = {
      photo_id: photoId,
      ocr_status: "processed",
      model: ocrOut.model,
      is_mock: ocrOut.isMock,
      results: ocrOut.results,
    };

    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Erro ao processar OCR.",
      },
      { status: 500 },
    );
  }
}
