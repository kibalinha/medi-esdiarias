import {
  buildImageDataUrl,
  buildMockOcrResults,
  buildOcrPrompt,
  mapValidatedOcrResults,
  parseOcrJsonResponse,
  type RunOcrInput,
  type RunOcrOutput,
} from "./shared";

const GROQ_CHAT_COMPLETIONS_URL =
  "https://api.groq.com/openai/v1/chat/completions";

interface GroqChatCompletionResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
}

export async function extractMeterReadingsWithGroq(
  input: RunOcrInput,
): Promise<RunOcrOutput> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === "your-groq-api-key") {
    return buildMockOcrResults(input);
  }

  const model = process.env.GROQ_OCR_MODEL || "qwen/qwen3.8-27b";
  const prompt = buildOcrPrompt(input, true);
  const dataUrl = buildImageDataUrl(input.imageBase64, input.mimeType);

  const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 0.2,
      max_completion_tokens: 2048,
      top_p: 0.95,
      stream: false,
      reasoning_effort: "default",
      stop: null,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `Groq OCR error (${response.status}): ${errText || response.statusText}`,
    );
  }

  const payload = (await response.json()) as GroqChatCompletionResponse;
  const rawText = payload.choices?.[0]?.message?.content ?? "{}";
  const validated = parseOcrJsonResponse(rawText);

  return {
    model: payload.model || model,
    isMock: false,
    rawResponse: payload,
    results: mapValidatedOcrResults(input, validated),
  };
}
