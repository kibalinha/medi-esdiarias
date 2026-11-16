import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractMeterReadings,
  parseOcrJsonResponse,
} from "@/lib/ocr";
import {
  getSupabasePublishableKey,
  isSupabaseConfigured,
} from "@/lib/supabase/config";
import type { MeterDto } from "@/types/contracts";

const sampleMeter: MeterDto = {
  id: "m-1",
  group_id: "g-1",
  group_slug: "bss_1",
  code: "bss1_consumo_fp",
  excel_header: "Consumo BSS 1 - Fora Ponta (kWh)",
  label: "Consumo Fora Ponta",
  unit: "kWh",
  reading_kind: "instant",
  multiplier_factor: 1,
  dial_capacity: null,
  photo_required: true,
  is_active_in_field: true,
  is_active_in_sheet: true,
  sort_order: 1,
  ocr_hint: null,
  threshold: null,
};

describe("OCR provider & JSON parsing", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("strips <think> blocks and markdown fences before parsing OCR JSON", () => {
    const raw = `<think>Analyzing display digits carefully...</think>\n\`\`\`json\n{"results":[{"meter_code":"bss1_consumo_fp","extracted_value":1420.5,"confidence":0.96,"raw_text_seen":"1420.5","notes":null}]}\n\`\`\``;
    const parsed = parseOcrJsonResponse(raw);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].extracted_value).toBe(1420.5);
    expect(parsed.results[0].confidence).toBe(0.96);
  });

  it("uses Groq OpenAI-compatible vision endpoint with qwen/qwen3.8-27b when GROQ_API_KEY is set", async () => {
    process.env.GROQ_API_KEY = "gsk_test_key";
    process.env.GROQ_OCR_MODEL = "qwen/qwen3.8-27b";
    delete process.env.GEMINI_API_KEY;

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "qwen/qwen3.8-27b",
        choices: [
          {
            message: {
              content:
                '<think>ok</think>{"results":[{"meter_code":"bss1_consumo_fp","extracted_value":987.2,"confidence":0.91,"raw_text_seen":"987.2"}]}',
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await extractMeterReadings({
      imageBase64: "AQID",
      mimeType: "image/webp",
      groupSlug: "bss_1",
      meters: [{ meter: sampleMeter, previousValue: 950 }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("qwen/qwen3.8-27b");
    expect(body.messages[0].content[1].image_url.url).toBe(
      "data:image/webp;base64,AQID",
    );
    expect(out.isMock).toBe(false);
    expect(out.model).toBe("qwen/qwen3.8-27b");
    expect(out.results[0].extracted_value).toBe(987.2);
    expect(out.results[0].confidence_band).toBe("high");
  });

  it("falls back to mock OCR when neither GROQ_API_KEY nor GEMINI_API_KEY is configured", async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const out = await extractMeterReadings({
      imageBase64: "AQID",
      mimeType: "image/webp",
      groupSlug: "bss_1",
      meters: [{ meter: sampleMeter, previousValue: 500 }],
    });

    expect(out.isMock).toBe(true);
    expect(out.results[0].extracted_value).toBe(500);
  });

  it("accepts NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as fallback for anon key", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";

    expect(getSupabasePublishableKey()).toBe("sb_publishable_test");
    expect(isSupabaseConfigured()).toBe(true);
  });
});
