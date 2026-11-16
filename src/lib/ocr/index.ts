export * from "./shared";
export * from "./gemini";
export * from "./groq";

import { extractMeterReadingsWithGemini } from "./gemini";
import { extractMeterReadingsWithGroq } from "./groq";
import { buildMockOcrResults, type RunOcrInput, type RunOcrOutput } from "./shared";

export async function extractMeterReadings(
  input: RunOcrInput,
): Promise<RunOcrOutput> {
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey && groqKey !== "your-groq-api-key") {
    return extractMeterReadingsWithGroq(input);
  }
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey !== "your-gemini-api-key") {
    return extractMeterReadingsWithGemini(input);
  }
  return buildMockOcrResults(input);
}
