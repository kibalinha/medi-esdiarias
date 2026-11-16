import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getAuthenticatedUser,
  LOCAL_SESSION_COOKIE,
  LOCAL_USERS,
} from "@/lib/supabase/auth";
import { getDataMode } from "@/lib/supabase/config";
import type { AuthMeResponse } from "@/types/contracts";

const LocalAuthSchema = z.union([
  z.object({
    action: z.literal("logout"),
  }),
  z.object({
    role: z.enum(["technician", "manager"]),
    email: z.string().email().optional(),
    full_name: z.string().min(1).optional(),
  }),
]);

export async function GET(req: Request) {
  const user = await getAuthenticatedUser(req);
  const body: AuthMeResponse = {
    user,
    data_mode: getDataMode(),
  };
  return NextResponse.json(body);
}

export async function POST(req: Request) {
  if (getDataMode() !== "local") {
    return NextResponse.json(
      {
        error: "Sessão local desabilitada quando Supabase Auth está ativo.",
        code: "FORBIDDEN",
      },
      { status: 403 },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = LocalAuthSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();

  if ("action" in parsed.data && parsed.data.action === "logout") {
    cookieStore.delete(LOCAL_SESSION_COOKIE);
    const body: AuthMeResponse = { user: null, data_mode: "local" };
    return NextResponse.json(body);
  }

  const data = parsed.data as {
    role: "technician" | "manager";
    email?: string;
    full_name?: string;
  };
  const base = LOCAL_USERS[data.role];
  const sessionUser = {
    ...base,
    email: data.email || base.email,
    full_name: data.full_name || base.full_name,
  };

  cookieStore.set(LOCAL_SESSION_COOKIE, JSON.stringify(sessionUser), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  const body: AuthMeResponse = {
    user: sessionUser,
    data_mode: "local",
  };
  return NextResponse.json(body);
}
