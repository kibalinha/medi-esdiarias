export type DataMode = "supabase" | "local";

export function getSupabasePublishableKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ""
  );
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = getSupabasePublishableKey();
  if (!url || !anonKey) return false;
  if (url.includes("your-project.supabase.co")) return false;
  if (anonKey === "your-anon-key" || anonKey === "your-publishable-key") return false;
  return true;
}

export function getDataMode(): DataMode {
  if (process.env.VITEST) {
    return "local";
  }
  return "supabase";
}

export function getStorageBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET || "field-photos";
}
