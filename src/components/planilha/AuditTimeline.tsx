"use client";

import { History } from "lucide-react";
import type { AuditAction, ReadingAuditLogDto } from "@/types/contracts";
import { Badge } from "@/components/ui/badge";

const ACTION_LABELS: Record<AuditAction, string> = {
  create: "Lançamento",
  update_value: "Correção de valor",
  approve: "Aprovação",
  flag: "Sinalização",
  import: "Importação XLSX",
};

const ACTION_VARIANTS: Record<
  AuditAction,
  "neutral" | "info" | "success" | "warning"
> = {
  create: "info",
  update_value: "warning",
  approve: "success",
  flag: "warning",
  import: "neutral",
};

export function AuditTimeline({ logs }: { logs: ReadingAuditLogDto[] }) {
  if (logs.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        Nenhum evento de auditoria registrado.
      </p>
    );
  }

  return (
    <ol className="relative space-y-3 border-l border-slate-200 pl-4">
      {logs.map((log) => (
        <li key={log.id} className="relative text-xs">
          <span className="absolute -left-[21px] top-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-slate-400 ring-4 ring-white" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge variant={ACTION_VARIANTS[log.action]}>
              <History className="h-3 w-3" />
              {ACTION_LABELS[log.action] ?? log.action}
            </Badge>
            <time className="text-[11px] text-slate-400">
              {new Date(log.created_at).toLocaleString("pt-BR")}
            </time>
          </div>
          <p className="mt-1 text-slate-700">
            Responsável:{" "}
            <strong className="font-semibold">
              {log.actor_name || "Sistema"}
            </strong>
          </p>
          {log.previous_value !== null || log.new_value !== null ? (
            <p className="text-slate-600 tabular-nums">
              {log.previous_value !== null
                ? `De ${log.previous_value.toLocaleString("pt-BR")} → `
                : "Valor: "}
              <strong>
                {log.new_value !== null
                  ? log.new_value.toLocaleString("pt-BR")
                  : "-"}
              </strong>
            </p>
          ) : null}
          {log.reason ? (
            <p className="mt-0.5 rounded bg-slate-50 px-2 py-1 text-slate-600 italic">
              &ldquo;{log.reason}&rdquo;
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
