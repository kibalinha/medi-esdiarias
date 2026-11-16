import { z } from "zod";
import type { MeterDto, OcrFieldResultDto } from "@/types/contracts";

export const OcrGeminiItemSchema = z.object({
  meter_code: z.string(),
  extracted_value: z.number().nullable(),
  confidence: z.number().min(0).max(1),
  raw_text_seen: z.string(),
  notes: z.string().nullable().optional(),
});

export const OcrGeminiResponseSchema = z.object({
  results: z.array(OcrGeminiItemSchema),
});

export type ValidatedOcrResponse = z.infer<typeof OcrGeminiResponseSchema>;

export interface OcrMeterContext {
  meter: MeterDto;
  previousValue?: number | null;
}

export interface RunOcrInput {
  imageBase64: string;
  mimeType: string;
  groupSlug: string;
  meters: OcrMeterContext[];
}

export interface RunOcrOutput {
  model: string;
  isMock: boolean;
  rawResponse: unknown;
  results: OcrFieldResultDto[];
}

export function classifyConfidenceBand(
  extractedValue: number | null,
  confidence: number,
): "high" | "low" | "unreadable" {
  if (extractedValue === null || !Number.isFinite(extractedValue)) {
    return "unreadable";
  }
  return confidence >= 0.85 ? "high" : "low";
}

export function buildOcrPrompt(input: RunOcrInput, requireJsonSchemaHint = false): string {
  const meterDescriptions = input.meters
    .map(({ meter, previousValue }) => {
      const parts = [
        `- meter_code: "${meter.code}"`,
        `label: "${meter.label}"`,
        `unit: "${meter.unit ?? ""}"`,
        `kind: "${meter.reading_kind}"`,
      ];
      if (meter.ocr_hint) parts.push(`hint: "${meter.ocr_hint}"`);
      if (previousValue !== null && previousValue !== undefined) {
        parts.push(`yesterday_reference: ${previousValue}`);
      }
      return parts.join(", ");
    })
    .join("\n");

  const lines = [
    `Você é um sistema de leitura óptica (OCR) de medidores prediais e painéis elétricos/hidráulicos/CAG.`,
    `Grupo atual: ${input.groupSlug}.`,
    `Extraia os valores numéricos exatos da imagem para os medidores listados abaixo:`,
    meterDescriptions,
    `Regras:`,
    `1. Retorne um item em "results" para cada meter_code solicitado.`,
    `2. Se um medidor não estiver legível ou não aparecer na imagem, retorne extracted_value = null e confidence <= 0.3.`,
    `3. Use ponto decimal (ex.: 1234.5). Nunca invente dígitos ilegíveis.`,
    `4. Informe confidence entre 0.0 e 1.0 e raw_text_seen exatamente como aparece no visor.`,
  ];

  if (requireJsonSchemaHint) {
    lines.push(
      `5. Responda EXCLUSIVAMENTE com um JSON válido no formato: {"results":[{"meter_code":"string","extracted_value":number|null,"confidence":number,"raw_text_seen":"string","notes":"string|null"}]}`,
    );
  }

  return lines.join("\n");
}

export function stripImageDataPrefix(imageBase64: string): string {
  return imageBase64.replace(/^data:[^;]+;base64,/, "");
}

export function buildImageDataUrl(imageBase64: string, mimeType: string): string {
  if (imageBase64.startsWith("data:")) {
    return imageBase64;
  }
  return `data:${mimeType || "image/webp"};base64,${imageBase64}`;
}

export function parseOcrJsonResponse(rawText: string): ValidatedOcrResponse {
  const withoutThink = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const withoutFence = withoutThink
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const parsedJson = JSON.parse(withoutFence || "{}");
  return OcrGeminiResponseSchema.parse(parsedJson);
}

export function mapValidatedOcrResults(
  input: RunOcrInput,
  validated: ValidatedOcrResponse,
): OcrFieldResultDto[] {
  const byCode = new Map(input.meters.map((m) => [m.meter.code, m.meter]));

  return input.meters.map(({ meter }) => {
    const found = validated.results.find((r) => r.meter_code === meter.code);
    if (!found) {
      return {
        meter_id: meter.id,
        meter_code: meter.code,
        label: meter.label,
        extracted_value: null,
        confidence: 0,
        raw_text_seen: "",
        notes: "Campo não retornado pelo OCR",
        confidence_band: "unreadable",
      };
    }
    const matchedMeter = byCode.get(found.meter_code) ?? meter;
    const confidence = Math.max(0, Math.min(1, found.confidence));
    return {
      meter_id: matchedMeter.id,
      meter_code: matchedMeter.code,
      label: matchedMeter.label,
      extracted_value: found.extracted_value,
      confidence,
      raw_text_seen: found.raw_text_seen,
      notes: found.notes ?? null,
      confidence_band: classifyConfidenceBand(found.extracted_value, confidence),
    };
  });
}

export function buildMockOcrResults(input: RunOcrInput): RunOcrOutput {
  const results: OcrFieldResultDto[] = input.meters.map(({ meter, previousValue }) => {
    let suggested = previousValue ?? null;
    if (suggested !== null) {
      if (meter.reading_kind === "cumulative") {
        suggested = Number((suggested + 12).toFixed(2));
      } else {
        suggested = Number(suggested.toFixed(2));
      }
    } else if (meter.reading_kind === "temperature") {
      suggested = 22.5;
    } else if (meter.reading_kind === "quality") {
      suggested = 520;
    } else {
      suggested = 100;
    }

    const confidence = 0.92;
    return {
      meter_id: meter.id,
      meter_code: meter.code,
      label: meter.label,
      extracted_value: suggested,
      confidence,
      raw_text_seen: String(suggested),
      notes: "OCR simulado (GROQ_API_KEY / GEMINI_API_KEY não configurada)",
      confidence_band: classifyConfidenceBand(suggested, confidence),
    };
  });

  return {
    model: "mock-ocr-vision",
    isMock: true,
    rawResponse: { mock: true, results },
    results,
  };
}
