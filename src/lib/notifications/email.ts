import { Resend } from "resend";
import type { AlertDto } from "@/types/contracts";

export interface SendEmailResult {
  sent: boolean;
  skipped: boolean;
  error?: string;
}

export async function sendCriticalAlertEmail(
  alerts: AlertDto[],
  recipients?: string[],
): Promise<SendEmailResult> {
  if (alerts.length === 0) {
    return { sent: false, skipped: true };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "re_your_resend_key") {
    return { sent: false, skipped: true };
  }

  const toList =
    recipients && recipients.length > 0
      ? recipients
      : (process.env.ALERT_EMAIL_TO || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

  if (toList.length === 0) {
    return { sent: false, skipped: true };
  }

  const from = process.env.ALERT_EMAIL_FROM || "alertas@medicoes.local";
  const resend = new Resend(apiKey);

  const lines = alerts.map(
    (a) =>
      `• [${a.reading_date}] ${a.meter_label} (${a.rule_code}): ${a.message}`,
  );

  try {
    const { error } = await resend.emails.send({
      from,
      to: toList,
      subject: `[CRÍTICO] Medições Diárias — ${alerts.length} alerta(s) crítico(s)`,
      text: `Alertas críticos detectados no Sistema de Medições Diárias:\n\n${lines.join("\n")}\n\nAcesse o Modo Planilha para revisar.`,
    });

    if (error) {
      return { sent: false, skipped: false, error: error.message };
    }
    return { sent: true, skipped: false };
  } catch (err) {
    return {
      sent: false,
      skipped: false,
      error: err instanceof Error ? err.message : "Unknown email error",
    };
  }
}
