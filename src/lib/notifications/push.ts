import webpush from "web-push";
import type { AlertDto } from "@/types/contracts";

export interface PushSubscriptionRecord {
  endpoint: string;
  keys_json: {
    p256dh: string;
    auth: string;
  };
}

export interface SendPushResult {
  sentCount: number;
  failedCount: number;
  skipped: boolean;
  expiredEndpoints: string[];
}

function getVapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:gestor@medicoes.local";

  if (
    !publicKey ||
    !privateKey ||
    publicKey === "your-vapid-public-key" ||
    privateKey === "your-vapid-private-key"
  ) {
    return null;
  }

  return { publicKey, privateKey, subject };
}

export async function sendCriticalAlertWebPush(
  alerts: AlertDto[],
  subscriptions: PushSubscriptionRecord[],
): Promise<SendPushResult> {
  if (alerts.length === 0 || subscriptions.length === 0) {
    return { sentCount: 0, failedCount: 0, skipped: true, expiredEndpoints: [] };
  }

  const vapid = getVapidConfig();
  if (!vapid) {
    return { sentCount: 0, failedCount: 0, skipped: true, expiredEndpoints: [] };
  }

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const first = alerts[0];
  const payload = JSON.stringify({
    title:
      alerts.length === 1
        ? `Alerta Crítico: ${first.meter_label}`
        : `${alerts.length} Alertas Críticos — Medições`,
    body: first.message,
    url: "/planilha",
    severity: "critical",
    reading_date: first.reading_date,
  });

  let sentCount = 0;
  let failedCount = 0;
  const expiredEndpoints: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys_json,
          },
          payload,
        );
        sentCount += 1;
      } catch (err: unknown) {
        failedCount += 1;
        const statusCode =
          typeof err === "object" && err !== null && "statusCode" in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          expiredEndpoints.push(sub.endpoint);
        }
      }
    }),
  );

  return {
    sentCount,
    failedCount,
    skipped: false,
    expiredEndpoints,
  };
}
