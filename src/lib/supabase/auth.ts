import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { AuthUserProfile, UserRole } from "@/types/contracts";
import { getDataMode } from "./config";
import { createSupabaseServerClient } from "./server";

export const LOCAL_SESSION_COOKIE = "medicoes_local_session";

export const LOCAL_USERS: Record<UserRole, AuthUserProfile> = {
  technician: {
    id: "00000000-0000-4000-8000-000000000101",
    email: "tecnico@medicoes.local",
    full_name: "Técnico de Campo",
    role: "technician",
    active: true,
  },
  manager: {
    id: "00000000-0000-4000-8000-000000000201",
    email: "gestor@medicoes.local",
    full_name: "Gestor Operacional",
    role: "manager",
    active: true,
  },
};

export function parseLocalRoleCookie(raw: string | undefined): UserRole | null {
  if (!raw) return null;
  if (raw === "technician" || raw === "manager") return raw;
  try {
    const parsed = JSON.parse(raw) as { role?: string };
    if (parsed.role === "technician" || parsed.role === "manager") {
      return parsed.role;
    }
  } catch {
    // ignore invalid JSON
  }
  return null;
}

export async function getAuthenticatedUser(
  req?: Request,
): Promise<AuthUserProfile | null> {
  const mode = getDataMode();

  if (mode === "local") {
    const headerRole = req?.headers.get("x-local-role");
    if (headerRole === "technician" || headerRole === "manager") {
      return LOCAL_USERS[headerRole];
    }

    const cookieStore = await cookies();
    const rawCookie = cookieStore.get(LOCAL_SESSION_COOKIE)?.value;
    const role = parseLocalRoleCookie(rawCookie);
    if (!role) return null;

    try {
      const parsed = JSON.parse(rawCookie!) as Partial<AuthUserProfile>;
      const base = LOCAL_USERS[role];
      return {
        ...base,
        email: parsed.email || base.email,
        full_name: parsed.full_name || base.full_name,
      };
    } catch {
      return LOCAL_USERS[role];
    }
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, active, restrict_groups")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.active) return null;

  let allowedGroupIds: string[] = [];
  if (profile.restrict_groups) {
    const { data: groupLinks } = await supabase
      .from("user_meter_groups")
      .select("group_id")
      .eq("user_id", user.id);
    allowedGroupIds = (groupLinks ?? []).map((row) => row.group_id);
  }

  return {
    id: profile.id,
    email: user.email || "",
    full_name: profile.full_name,
    role: profile.role,
    active: profile.active,
    restrict_groups: Boolean(profile.restrict_groups),
    allowed_group_ids: allowedGroupIds,
  };
}

export async function requireAuth(
  req?: Request,
  requiredRole?: UserRole,
): Promise<
  | { user: AuthUserProfile; errorResponse: null }
  | { user: null; errorResponse: NextResponse }
> {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return {
      user: null,
      errorResponse: NextResponse.json(
        { error: "Não autenticado.", code: "UNAUTHORIZED" },
        { status: 401 },
      ),
    };
  }

  if (requiredRole && user.role !== requiredRole) {
    return {
      user: null,
      errorResponse: NextResponse.json(
        {
          error: `Permissão insuficiente. Requer perfil ${requiredRole}.`,
          code: "FORBIDDEN",
        },
        { status: 403 },
      ),
    };
  }

  return { user, errorResponse: null };
}
