"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Download,
  Filter,
  Loader2,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import type {
  AlertDto,
  AlertsListResponse,
  AuthMeResponse,
  CorrectReadingRequest,
  PlanilhaCellDto,
  PlanilhaResponse,
  SpreadsheetColumnDefDto,
} from "@/types/contracts";
import { AppNav } from "@/components/ui/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { KpiHeader } from "@/components/planilha/KpiHeader";
import {
  ExcelGrid,
  type InlineSavePayload,
} from "@/components/planilha/ExcelGrid";
import {
  InspectionDrawer,
  type EmptyCellTarget,
} from "@/components/planilha/InspectionDrawer";

type GroupFilterValue =
  | "all"
  | "agua"
  | "temperaturas"
  | "bss"
  | "chillers"
  | "cag";

const GROUP_FILTERS: Array<{ value: GroupFilterValue; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "agua", label: "Água" },
  { value: "temperaturas", label: "Temperaturas" },
  { value: "bss", label: "Energia BSS" },
  { value: "chillers", label: "Chillers" },
  { value: "cag", label: "CAG" },
];

const MONTHS_PT = [
  { value: "all", label: "Todos os meses" },
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

function matchesGroupFilter(
  col: SpreadsheetColumnDefDto,
  filter: GroupFilterValue,
): boolean {
  if (col.kind === "KEY" || filter === "all") return true;
  if (filter === "agua") return col.group_slug === "agua";
  if (filter === "temperaturas") return col.group_slug.startsWith("temp_");
  if (filter === "bss") return col.group_slug.startsWith("bss_");
  if (filter === "chillers") return col.group_slug.startsWith("chiller_");
  if (filter === "cag") return col.group_slug === "cag";
  return true;
}

export default function PlanilhaPage() {
  const router = useRouter();
  const [auth, setAuth] = React.useState<AuthMeResponse | null>(null);
  const [planilha, setPlanilha] = React.useState<PlanilhaResponse | null>(null);
  const [alerts, setAlerts] = React.useState<AlertDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [inlineToast, setInlineToast] = React.useState<string | null>(null);
  const [quickEditMode, setQuickEditMode] = React.useState<boolean>(false);

  // Manual Entry Modal state
  const [manualModalOpen, setManualModalOpen] = React.useState<boolean>(false);
  const [manualDate, setManualDate] = React.useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [manualMeterCode, setManualMeterCode] = React.useState<string>("");
  const [manualValue, setManualValue] = React.useState<string>("");
  const [manualRollover, setManualRollover] = React.useState<boolean>(false);
  const [manualReplaced, setManualReplaced] = React.useState<boolean>(false);
  const [manualBaseline, setManualBaseline] = React.useState<string>("0");
  const [manualReason, setManualReason] = React.useState<string>("");
  const [manualBusy, setManualBusy] = React.useState<boolean>(false);
  const [manualError, setManualError] = React.useState<string | null>(null);

  // Filters: default to full year 2026 (01/01..31/12 ordered 31/12 -> 01/01)
  const [year, setYear] = React.useState<string>("2026");
  const [month, setMonth] = React.useState<string>("all");
  const [groupFilter, setGroupFilter] = React.useState<GroupFilterValue>("all");
  const [searchText, setSearchText] = React.useState<string>("");
  const [onlyPendingOrAlerts, setOnlyPendingOrAlerts] =
    React.useState<boolean>(false);

  // Inspection drawer selection (either existing reading or empty INPUT cell)
  const [selectedCell, setSelectedCell] = React.useState<{
    readingId: string | null;
    emptyTarget: EmptyCellTarget | null;
    header: string;
    kind: SpreadsheetColumnDefDto["kind"];
  } | null>(null);

  const fetchAll = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      if (!meRes.ok) {
        router.replace("/login");
        return;
      }
      const meData: AuthMeResponse = await meRes.json();
      setAuth(meData);

      if (!meData.user) {
        router.replace("/login");
        return;
      }
      if (meData.user.role !== "manager") {
        router.replace("/campo");
        return;
      }

      const params = new URLSearchParams();
      if (year !== "all") params.set("year", year);
      if (onlyPendingOrAlerts) params.set("only_pending_or_alerts", "1");

      const [planilhaRes, alertsRes] = await Promise.all([
        fetch(`/api/planilha?${params.toString()}`, { cache: "no-store" }),
        fetch("/api/alerts?unacknowledged=1", { cache: "no-store" }),
      ]);

      if (!planilhaRes.ok) {
        const errPayload = await planilhaRes.json().catch(() => null);
        throw new Error(
          errPayload?.error ||
            `Erro HTTP ${planilhaRes.status} ao carregar planilha.`,
        );
      }

      const planilhaData: PlanilhaResponse = await planilhaRes.json();
      setPlanilha(planilhaData);

      if (alertsRes.ok) {
        const alertsData: AlertsListResponse = await alertsRes.json();
        setAlerts(alertsData.alerts);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao carregar planilha.",
      );
    } finally {
      setLoading(false);
    }
  }, [router, year, onlyPendingOrAlerts]);

  React.useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  async function handleAcknowledgeAlert(alertId: string) {
    try {
      const res = await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert_id: alertId, acknowledge: true }),
      });
      if (res.ok) {
        setAlerts((prev) => prev.filter((a) => a.id !== alertId));
        void fetchAll();
      }
    } catch {
      // ignore transient error
    }
  }

  async function handleInlineSave(payload: InlineSavePayload) {
    setError(null);
    setInlineToast(null);
    const body: CorrectReadingRequest = payload.cell?.reading_id
      ? {
          reading_id: payload.cell.reading_id,
          new_value: payload.newValue,
          reason: "Edição manual na planilha",
        }
      : {
          reading_date: payload.readingDate,
          meter_code: payload.col.meter_code ?? undefined,
          new_value: payload.newValue,
          reason: "Lançamento manual na planilha",
        };

    const res = await fetch("/api/readings/correct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errPayload = await res.json().catch(() => null);
      const msg = errPayload?.error || "Erro ao salvar célula na planilha.";
      setError(msg);
      throw new Error(msg);
    }

    setInlineToast(
      `Salvo ${payload.col.header} (${payload.readingDate}): ${payload.newValue.toLocaleString("pt-BR")}`,
    );
    await fetchAll();
  }

  const inputColumns = React.useMemo(() => {
    if (!planilha) return [];
    return planilha.columns.filter(
      (col) => col.kind === "INPUT" && Boolean(col.meter_code),
    );
  }, [planilha]);

  React.useEffect(() => {
    if (!manualMeterCode && inputColumns[0]?.meter_code) {
      setManualMeterCode(inputColumns[0].meter_code);
    }
  }, [manualMeterCode, inputColumns]);

  async function handleManualModalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setManualError(null);
    const parsed = Number(manualValue.replace(",", "."));
    if (!manualDate || !manualMeterCode) {
      setManualError("Selecione a data e o medidor.");
      return;
    }
    if (manualValue.trim() === "" || !Number.isFinite(parsed)) {
      setManualError("Informe um valor numérico válido.");
      return;
    }

    setManualBusy(true);
    try {
      const body: CorrectReadingRequest = {
        reading_date: manualDate,
        meter_code: manualMeterCode,
        new_value: parsed,
        reason: manualReason.trim() || "Lançamento manual na planilha",
        is_rollover: manualRollover,
        is_meter_replaced: manualReplaced,
        replacement_baseline: manualReplaced
          ? Number(manualBaseline) || 0
          : null,
      };
      const res = await fetch("/api/readings/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errPayload = await res.json().catch(() => null);
        throw new Error(
          errPayload?.error || "Erro ao salvar lançamento manual.",
        );
      }
      const chosenCol = inputColumns.find(
        (c) => c.meter_code === manualMeterCode,
      );
      setInlineToast(
        `Salvo ${chosenCol?.header ?? manualMeterCode} (${manualDate}): ${parsed.toLocaleString("pt-BR")}`,
      );
      setManualValue("");
      setManualReason("");
      setManualRollover(false);
      setManualReplaced(false);
      setManualBaseline("0");
      setManualModalOpen(false);
      await fetchAll();
    } catch (err) {
      setManualError(
        err instanceof Error ? err.message : "Erro ao salvar leitura.",
      );
    } finally {
      setManualBusy(false);
    }
  }

  const visibleColumns = React.useMemo(() => {
    if (!planilha) return [];
    const q = searchText.trim().toLowerCase();
    return planilha.columns.filter((col) => {
      if (col.kind === "KEY") return true;
      if (!matchesGroupFilter(col, groupFilter)) return false;
      if (q && !/^\d{2,4}[-/]/.test(q)) {
        return (
          col.header.toLowerCase().includes(q) ||
          col.group_name.toLowerCase().includes(q) ||
          (col.meter_code?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [planilha, groupFilter, searchText]);

  const visibleRows = React.useMemo(() => {
    if (!planilha) return [];
    const q = searchText.trim().toLowerCase();
    const targetMonth = month !== "all" ? Number(month) : null;
    return planilha.rows
      .filter((row) => {
        if (targetMonth !== null) {
          const rowMonth = Number(row.reading_date.slice(5, 7));
          if (rowMonth !== targetMonth) return false;
        }
        if (onlyPendingOrAlerts) {
          if (!row.has_pending && !row.highest_alert_severity) return false;
        }
        if (q && /^\d{2,4}[-/]/.test(q)) {
          const dateBr = row.reading_date.split("-").reverse().join("/");
          return row.reading_date.includes(q) || dateBr.includes(q);
        }
        return true;
      })
      .sort((a, b) => a.reading_date.localeCompare(b.reading_date));
  }, [planilha, month, onlyPendingOrAlerts, searchText]);

  function handleExportCsv() {
    if (!planilha) return;
    const cols = visibleColumns;
    const escape = (val: string) => `"${val.replaceAll('"', '""')}"`;
    const headerLine = cols.map((c) => escape(c.header)).join(";");
    const lines = visibleRows.map((row) =>
      cols
        .map((col) => {
          if (col.kind === "KEY") return escape(row.reading_date);
          const cell = row.cells[col.key];
          return escape(cell?.formatted ?? "");
        })
        .join(";"),
    );
    const csv = "\uFEFF" + [headerLine, ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `medicoes_${year}_${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!auth?.user || auth.user.role !== "manager") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-100 text-sm text-slate-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
        Verificando permissões...
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-100">
      <AppNav user={auth.user} dataMode={auth.data_mode} />

      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-4">
        {/* Title & Export Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              Modo Planilha — Controle Diário
            </h1>
            <p className="text-xs text-slate-500">
              Calendário completo (01/01 a 31/12 em ordem cronológica) com edição
              manual apenas em INPUTs e fórmulas bloqueadas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={quickEditMode ? "primary" : "outline"}
              data-testid="toggle-quick-edit"
              aria-pressed={quickEditMode}
              onClick={() => setQuickEditMode((v) => !v)}
              className={
                quickEditMode
                  ? "bg-amber-500 text-white hover:bg-amber-600 border border-amber-600 shadow-xs"
                  : "border-sky-300 text-sky-800 hover:bg-sky-50"
              }
            >
              <Pencil className="h-3.5 w-3.5" />
              Modo Edição Rápida (1 clique)
            </Button>

            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="open-manual-entry"
              onClick={() => {
                setManualError(null);
                setManualModalOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              + Lançar Leitura
            </Button>

            <a
              href={`/api/export/xlsx${year !== "all" ? `?year=${year}` : ""}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar XLSX
            </a>
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="h-3.5 w-3.5" />
              Exportar CSV
            </Button>
          </div>
        </div>

        {/* KPI Bar */}
        {planilha ? (
          <KpiHeader
            kpis={planilha.kpis}
            onlyPendingOrAlerts={onlyPendingOrAlerts}
            onTogglePendingOrAlerts={() => setOnlyPendingOrAlerts((v) => !v)}
          />
        ) : null}

        {inlineToast ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-900">
            <span>{inlineToast}</span>
            <button
              type="button"
              onClick={() => setInlineToast(null)}
              className="text-emerald-700 hover:underline cursor-pointer"
            >
              Fechar
            </button>
          </div>
        ) : null}

        {/* Active Operational Alerts Panel */}
        {alerts.length > 0 ? (
          <section
            aria-label="Alertas operacionais ativos"
            className="rounded-xl border border-rose-200 bg-white p-3 shadow-2xs space-y-2"
          >
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-rose-800">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                Alertas Operacionais Ativos ({alerts.length})
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {alerts.slice(0, 6).map((al) => (
                <div
                  key={al.id}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                    al.severity === "critical"
                      ? "border-rose-300 bg-rose-50 text-rose-950"
                      : "border-amber-300 bg-amber-50 text-amber-950"
                  }`}
                >
                  <Badge
                    variant={al.severity === "critical" ? "danger" : "warning"}
                  >
                    {al.severity === "critical" ? "CRÍTICO" : "ATENÇÃO"}
                  </Badge>
                  <span className="font-medium">
                    [{al.reading_date}] {al.message}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleAcknowledgeAlert(al.id)}
                    title="Reconhecer alerta"
                    className="inline-flex items-center gap-1 rounded bg-white/80 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-white cursor-pointer"
                  >
                    <Check className="h-3 w-3" />
                    OK
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Filters Bar */}
        <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <Filter className="h-3.5 w-3.5" />
              Filtros:
            </div>

            <select
              aria-label="Filtrar por ano"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800"
            >
              <option value="all">Todos os anos</option>
              {(planilha?.available_years ?? [2026, 2025]).map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>

            <select
              aria-label="Filtrar por mês"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800"
            >
              {MONTHS_PT.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>

            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar coluna ou data (ex: 2026-01)"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="h-9 pl-8 text-xs"
              />
            </div>

            <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyPendingOrAlerts}
                onChange={(e) => setOnlyPendingOrAlerts(e.target.checked)}
              />
              Somente Pendentes/Alertas
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {GROUP_FILTERS.map((gf) => (
              <button
                key={gf.value}
                type="button"
                onClick={() => setGroupFilter(gf.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition cursor-pointer ${
                  groupFilter === gf.value
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {gf.label}
              </button>
            ))}
          </div>
        </section>

        {/* Grid Area */}
        {loading && !planilha ? (
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-20 text-sm text-slate-500 gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
            Carregando grade da planilha...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 space-y-2">
            <p>{error}</p>
            <Button size="sm" onClick={() => void fetchAll()}>
              Recarregar
            </Button>
          </div>
        ) : planilha ? (
          <ExcelGrid
            columns={visibleColumns}
            rows={visibleRows}
            userRole={auth.user.role}
            quickEditMode={quickEditMode}
            onInlineSave={handleInlineSave}
            onSelectCell={(
              readingDate: string,
              cell: PlanilhaCellDto | undefined,
              col: SpreadsheetColumnDefDto,
            ) => {
              if (col.kind !== "INPUT") return;
              if (cell?.reading_id) {
                setSelectedCell({
                  readingId: cell.reading_id,
                  emptyTarget: null,
                  header: col.header,
                  kind: col.kind,
                });
              } else if (col.meter_code) {
                setSelectedCell({
                  readingId: null,
                  emptyTarget: {
                    readingDate,
                    meterCode: col.meter_code,
                    columnHeader: col.header,
                    unit: col.unit,
                  },
                  header: col.header,
                  kind: col.kind,
                });
              }
            }}
          />
        ) : null}
      </main>

      <InspectionDrawer
        readingId={selectedCell?.readingId ?? null}
        emptyTarget={selectedCell?.emptyTarget ?? null}
        columnHeader={selectedCell?.header ?? ""}
        columnKind={selectedCell?.kind ?? "INPUT"}
        userRole={auth.user.role}
        onClose={() => setSelectedCell(null)}
        onMutated={(savedReadingId) => {
          if (savedReadingId) {
            setSelectedCell((prev) =>
              prev
                ? {
                    ...prev,
                    readingId: savedReadingId,
                    emptyTarget: null,
                  }
                : null,
            );
          }
          void fetchAll();
        }}
      />

      <Modal
        open={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        title="Lançamento Manual na Planilha"
        description="Insira ou atualize diretamente um campo de entrada (INPUT). Fórmulas e colunas calculadas são atualizadas automaticamente."
      >
        <form onSubmit={handleManualModalSubmit} className="space-y-3.5">
          {manualError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {manualError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label
                htmlFor="manual-entry-date"
                className="block text-xs font-medium text-slate-700"
              >
                Data
              </label>
              <Input
                id="manual-entry-date"
                type="date"
                required
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="manual-entry-value"
                className="block text-xs font-medium text-slate-700"
              >
                Valor bruto
              </label>
              <Input
                id="manual-entry-value"
                type="number"
                step="any"
                required
                placeholder="Ex: 1234.5"
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="manual-entry-meter"
              className="block text-xs font-medium text-slate-700"
            >
              Medidor (somente campos INPUT)
            </label>
            <select
              id="manual-entry-meter"
              value={manualMeterCode}
              onChange={(e) => setManualMeterCode(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800"
            >
              {inputColumns.map((col) => (
                <option key={col.key} value={col.meter_code!}>
                  {col.header} {col.unit ? `(${col.unit})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-slate-700">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={manualRollover}
                onChange={(e) => setManualRollover(e.target.checked)}
              />
              Virada de medidor (Rollover)
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={manualReplaced}
                onChange={(e) => setManualReplaced(e.target.checked)}
              />
              Medidor trocado
            </label>
          </div>

          {manualReplaced ? (
            <div className="space-y-1">
              <label
                htmlFor="manual-entry-baseline"
                className="block text-xs font-medium text-slate-700"
              >
                Baseline do medidor novo
              </label>
              <Input
                id="manual-entry-baseline"
                type="number"
                step="any"
                value={manualBaseline}
                onChange={(e) => setManualBaseline(e.target.value)}
              />
            </div>
          ) : null}

          <div className="space-y-1">
            <label
              htmlFor="manual-entry-reason"
              className="block text-xs font-medium text-slate-700"
            >
              Justificativa / observação (opcional)
            </label>
            <Input
              id="manual-entry-reason"
              placeholder="Ex.: Lançamento manual na planilha"
              value={manualReason}
              onChange={(e) => setManualReason(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setManualModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={manualBusy}>
              {manualBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              Salvar na planilha
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
