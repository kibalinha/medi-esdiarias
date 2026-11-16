import { GoogleGenAI, Type } from "@google/genai";
import {
  buildMockOcrResults,
  buildOcrPrompt,
  mapValidatedOcrResults,
  parseOcrJsonResponse,
  stripImageDataPrefix,
  type RunOcrInput,
  type RunOcrOutput,
} from "./shared";

export async function extractMeterReadingsWithGemini(
  input: RunOcrInput,
): Promise<RunOcrOutput> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your-gemini-api-key") {
    return buildMockOcrResults(input);
  }

  const model = process.env.GEMINI_OCR_MODEL || "gemini-2.5-flash";
  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildOcrPrompt(input, false);
  const cleanBase64 = stripImageDataPrefix(input.imageBase64);

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: input.mimeType || "image/webp",
              data: cleanBase64,
            },
          },
          { text: prompt },
        ],
      },
    ],
    config: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          results: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                meter_code: { type: Type.STRING },
                extracted_value: { type: Type.NUMBER, nullable: true },
                confidence: { type: Type.NUMBER },
                raw_text_seen: { type: Type.STRING },
                notes: { type: Type.STRING, nullable: true },
              },
              required: [
                "meter_code",
                "extracted_value",
                "confidence",
                "raw_text_seen",
              ],
            },
          },
        },
        required: ["results"],
      },
    },
  });

  const rawText = response.text ?? "{}";
  const validated = parseOcrJsonResponse(rawText);

  return {
    model,
    isMock: false,
    rawResponse: validated,
    results: mapValidatedOcrResults(input, validated),
  };
}
