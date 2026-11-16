export interface CompressedImageResult {
  blob: Blob;
  dataBase64: string;
  mimeType: "image/webp" | "image/jpeg";
  sizeBytes: number;
  width: number;
  height: number;
}

const TARGET_MAX_BYTES = 380 * 1024; // ~200-400 KB target per SPEC 2 & 6
const MAX_DIMENSION = 1600;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler imagem."));
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: "image/webp" | "image/jpeg",
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

function loadHtmlImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível decodificar a imagem capturada."));
    };
    img.src = url;
  });
}

/**
 * Compresses a captured field photo in the browser to WebP (with JPEG fallback)
 * targeting ~200-400 KB while preserving sharp digits for Gemini Vision OCR.
 */
export async function compressFieldPhoto(
  file: File | Blob,
): Promise<CompressedImageResult> {
  const img = await loadHtmlImage(file);
  const srcWidth = img.naturalWidth || img.width || 1280;
  const srcHeight = img.naturalHeight || img.height || 960;

  let scale = Math.min(1, MAX_DIMENSION / Math.max(srcWidth, srcHeight));
  let targetW = Math.max(1, Math.round(srcWidth * scale));
  let targetH = Math.max(1, Math.round(srcHeight * scale));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Contexto Canvas 2D indisponível neste navegador.");
  }

  // Prefer WebP; fallback to JPEG if browser cannot encode image/webp
  let chosenMime: "image/webp" | "image/jpeg" = "image/webp";
  canvas.width = targetW;
  canvas.height = targetH;
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const probeWebp = await canvasToBlob(canvas, "image/webp", 0.82);
  if (!probeWebp || probeWebp.type !== "image/webp") {
    chosenMime = "image/jpeg";
  }

  let bestBlob: Blob | null =
    chosenMime === "image/webp" && probeWebp
      ? probeWebp
      : await canvasToBlob(canvas, chosenMime, 0.82);

  const qualitySteps = [0.74, 0.65, 0.56, 0.48];
  for (const q of qualitySteps) {
    if (bestBlob && bestBlob.size <= TARGET_MAX_BYTES) break;
    const candidate = await canvasToBlob(canvas, chosenMime, q);
    if (candidate) {
      bestBlob = candidate;
    }
  }

  // If still larger than 400KB, downscale slightly once more
  if (bestBlob && bestBlob.size > TARGET_MAX_BYTES) {
    scale = scale * 0.75;
    targetW = Math.max(640, Math.round(srcWidth * scale));
    targetH = Math.max(480, Math.round(srcHeight * scale));
    canvas.width = targetW;
    canvas.height = targetH;
    ctx.drawImage(img, 0, 0, targetW, targetH);
    const resized = await canvasToBlob(canvas, chosenMime, 0.68);
    if (resized) bestBlob = resized;
  }

  if (!bestBlob) {
    throw new Error("Falha ao comprimir imagem.");
  }

  const dataBase64 = await blobToBase64(bestBlob);

  return {
    blob: bestBlob,
    dataBase64,
    mimeType: chosenMime,
    sizeBytes: bestBlob.size,
    width: targetW,
    height: targetH,
  };
}
