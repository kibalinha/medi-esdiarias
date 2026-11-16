import type { AlertDto } from "@/types/contracts";
import { sendCriticalAlertEmail } from "./email";
import {
  sendCriticalAlertWebPush,
  type PushSubscriptionRecord,
} from "./push";

export * from "./email";
export * from "./push";

export async function dispatchCriticalNotifications(params: {
  alerts: AlertDto[];
  subscriptions: PushSubscriptionRecord[];
  emailRecipients?: string[];
}): Promise<{
  emailSent: boolean;
  pushSentCount: number;
  expiredEndpoints: string[];
}> {
  const criticalAlerts = params.alerts.filter((a) => a.severity === "critical");
  if (criticalAlerts.length === 0) {
    return { emailSent: false, pushSentCount: 0, expiredEndpoints: [] };
  }

  const [emailResult, pushResult] = await Promise.all([
    sendCriticalAlertEmail(criticalAlerts, params.emailRecipients),
    sendCriticalAlertWebPush(criticalAlerts, params.subscriptions),
  ]);

  return {
    emailSent: emailResult.sent,
    pushSentCount: pushResult.sentCount,
    expiredEndpoints: pushResult.expiredEndpoints,
  };
}
