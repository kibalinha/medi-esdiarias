"use client";

import {
  AlertTriangle,
  Clock,
  Droplets,
  Gauge,
  Zap,
} from "lucide-react";
import type { PlanilhaKpisDto } from "@/types/contracts";
import { cn } from "@/components/ui/cn";

interface KpiHeaderProps {
  kpis: PlanilhaKpisDto;
  onlyPendingOrAlerts: boolean;
  onTogglePendingOrAlerts: () => void;
}

function fmtNumber(val: number | null, decimals = 1): string {
  if (val === null || !Number.isFinite(val)) return "-";
  return val.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function fmtPercent(val: number | null): string {
  if (val === null || !Number.isFinite(val)) return "-";
  return `${(val * 100).toFixed(1)}%`;
}

export function KpiHeader({
  kpis,
  onlyPendingOrAlerts,
  onTogglePendingOrAlerts,
}: KpiHeaderProps) {
  return (
    <section
      aria-label="Indicadores principais"
      className="grid grid-cols-2 gap-3 lg:grid-cols-5"
    >
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
        <div className="flex items-center justify-between text-xs font-medium text-slate-500">
          <span>Consumo Água Hoje</span>
          <Droplets className="h-4 w-4 text-sky-600" />
        </div>
        <div className="mt-1.5 text-xl font-bold tabular-nums text-slate-900">
          {fmtNumber(kpis.agua_consumo_geral_m3)} <span className="text-xs font-normal text-slate-500">m³</span>
        </div>
        <p className="mt-0.5 text-[11px] text-slate-400">
          Ref.: {kpis.reference_date ?? "N/D"}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
        <div className="flex items-center justify-between text-xs font-medium text-slate-500">
          <span>Energia Total (BSS 1..4)</span>
          <Zap className="h-4 w-4 text-indigo-600" />
        </div>
        <div className="mt-1.5 text-xl font-bold tabular-nums text-slate-900">
          {fmtNumber(kpis.energia_consumo_total_kwh, 0)}{" "}
          <span className="text-xs font-normal text-slate-500">kWh</span>
        </div>
        <p className="mt-0.5 text-[11px] text-slate-400">
          Soma Geral BSS 1 a 4
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
        <div className="flex items-center justify-between text-xs font-medium text-slate-500">
          <span>% Consumo CAG</span>
          <Gauge className="h-4 w-4 text-teal-600" />
        </div>
        <div className="mt-1.5 flex items-baseline gap-2 text-lg font-bold tabular-nums text-slate-900">
          <span>{fmtPercent(kpis.cag_percent_energia)}</span>
          <span className="text-xs font-normal text-slate-400">Energia</span>
        </div>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Água CAG:{" "}
          <strong className="font-semibold text-slate-700">
            {kpis.cag_percent_agua === null
              ? "- (N/D)"
              : fmtPercent(kpis.cag_percent_agua)}
          </strong>
        </p>
      </div>

      <button
        type="button"
        onClick={onTogglePendingOrAlerts}
        className={cn(
          "rounded-xl border p-3.5 text-left shadow-2xs transition cursor-pointer",
          onlyPendingOrAlerts
            ? "border-sky-500 bg-sky-50 ring-2 ring-sky-500/20"
            : "border-slate-200 bg-white hover:border-sky-300",
        )}
      >
        <div className="flex items-center justify-between text-xs font-medium text-slate-500">
          <span>Pendências de Revisão</span>
          <Clock className="h-4 w-4 text-sky-600" />
        </div>
        <div className="mt-1.5 text-xl font-bold tabular-nums text-sky-700">
          {kpis.pending_review_count}
        </div>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {onlyPendingOrAlerts
            ? "Filtro ativo (clique p/ limpar)"
            : "Clique para filtrar pendentes"}
        </p>
      </button>

      <div
        className={cn(
          "rounded-xl border p-3.5 shadow-2xs col-span-2 lg:col-span-1",
          kpis.active_critical_alerts_count > 0
            ? "border-rose-300 bg-rose-50"
            : "border-slate-200 bg-white",
        )}
      >
        <div className="flex items-center justify-between text-xs font-medium text-slate-600">
          <span>Alertas Críticos Ativos</span>
          <AlertTriangle
            className={cn(
              "h-4 w-4",
              kpis.active_critical_alerts_count > 0
                ? "text-rose-600"
                : "text-slate-400",
            )}
          />
        </div>
        <div
          className={cn(
            "mt-1.5 text-xl font-bold tabular-nums",
            kpis.active_critical_alerts_count > 0
              ? "text-rose-700"
              : "text-slate-900",
          )}
        >
          {kpis.active_critical_alerts_count}
        </div>
        <p className="mt-0.5 text-[11px] text-slate-500">
          + {kpis.active_warning_alerts_count} alerta(s) de atenção
        </p>
      </div>
    </section>
  );
}
