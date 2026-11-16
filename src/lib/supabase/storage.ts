import { createSupabaseAdminClient, createSupabaseServerClient } from "./server";
import { getDataMode, getStorageBucket } from "./config";

export async function uploadFieldPhotoToStorage(params: {
  storagePath: string;
  buffer: Buffer;
  contentType: string;
}): Promise<{ storagePath: string; error: string | null }> {
  if (getDataMode() === "local") {
    return { storagePath: params.storagePath, error: null };
  }

  const client =
    createSupabaseAdminClient() ?? (await createSupabaseServerClient());
  if (!client) {
    return { storagePath: params.storagePath, error: "Supabase client unavailable" };
  }

  const bucket = getStorageBucket();
  const { error } = await client.storage
    .from(bucket)
    .upload(params.storagePath, params.buffer, {
      contentType: params.contentType,
      upsert: true,
    });

  if (error) {
    return { storagePath: params.storagePath, error: error.message };
  }
  return { storagePath: params.storagePath, error: null };
}

export async function createPhotoSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600,
  localFallbackDataUrl?: string | null,
): Promise<string> {
  if (getDataMode() === "local") {
    return (
      localFallbackDataUrl ||
      `data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="100%" height="100%" fill="#0f172a"/><text x="50%" y="50%" fill="#e2e8f0" font-family="sans-serif" font-size="14" text-anchor="middle">${storagePath}</text></svg>`,
      )}`
    );
  }

  const client =
    createSupabaseAdminClient() ?? (await createSupabaseServerClient());
  if (!client) return "";

  const bucket = getStorageBucket();
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return "";
  }
  return data.signedUrl;
}
