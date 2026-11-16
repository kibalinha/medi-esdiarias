import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/supabase/auth";
import {
  deletePushSubscription,
  hasPushSubscriptionForUser,
  savePushSubscription,
} from "@/lib/supabase/repository";
import type { PushConfigResponse } from "@/types/contracts";

const SubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const UnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth.errorResponse) return auth.errorResponse;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const validKey =
    publicKey && publicKey !== "your-vapid-public-key" ? publicKey : null;

  const subscribed = await hasPushSubscriptionForUser(auth.user.id);
  const body: PushConfigResponse = {
    vapid_public_key: validKey,
    subscribed,
  };
  return NextResponse.json(body);
}

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth.errorResponse) return auth.errorResponse;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = SubscribeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload push inválido.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await savePushSubscription(parsed.data, auth.user);
    return NextResponse.json({ subscribed: true });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Erro ao salvar inscrição push.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const auth = await requireAuth(req);
  if (auth.errorResponse) return auth.errorResponse;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = UnsubscribeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Endpoint inválido.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await deletePushSubscription(parsed.data.endpoint, auth.user);
    return NextResponse.json({ subscribed: false });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Erro ao remover inscrição push.",
      },
      { status: 500 },
    );
  }
}
