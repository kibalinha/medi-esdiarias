"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Droplets,
  Flame,
  Loader2,
  Thermometer,
  Zap,
} from "lucide-react";
import type { AuthMeResponse, DashboardResponse } from "@/types/contracts";
import { AppNav } from "@/components/ui/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GroupedBarChart,
  MultiLineChart,
  SectorShareBars,
} from "@/components/dashboard/DashboardCharts";

type SectorTab = "all" | "agua" | "energia" | "cag" | "temperaturas" | "chillers";

const SECTOR_TABS: Array<{ value: SectorTab; label: string }> = [
  { value: "all", label: "Visão Geral" },
  { value: "agua", label: "Água" },
  { value: "energia", label: "Energia (BSS 1–4)" },
  { value: "cag", label: "CAG" },
  { value: "temperaturas", label: "Temperaturas" },
  { value: "chillers", label: "Chillers" },
];

function YoyBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <span className="text-[11px] text-slate-400">Sem base ano anterior</span>
    );
  }
  const positive = pct > 0;
  return (
    <span
      className={`text-[11px] font-semibold ${
        positive ? "text-rose-600" : "text-emerald-600"
      }`}
    >
      {positive ? `+${pct}%` : `${pct}%`} vs ano anterior
    </span>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [auth, setAuth] = React.useState<AuthMeResponse | null>(null);
  const [data, setData] = React.useState<DashboardResponse | null>(null);
  const [selectedYear, setSelectedYear] = React.useState<string>("2026");
  const [sector, setSector] = React.useState<SectorTab>("all");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadDashboard = React.useCallback(async () => {
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

      const res = await fetch(
        `/api/dashboard?year=${encodeURIComponent(selectedYear)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const errPayload = await res.json().catch(() => null);
        throw new Error(
          errPayload?.error ||
            `Erro HTTP ${res.status} ao carregar dashboard.`,
        );
      }
      setData(await res.json());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao carregar dashboard.",
      );
    } finally {
      setLoading(false);
    }
  }, [router, selectedYear]);

  React.useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  if (!auth?.user || auth.user.role !== "manager") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-100 text-sm text-slate-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
        Verificando permissões de administrador...
      </div>
    );
  }

  const monthLabels = data?.monthly_series.map((m) => m.label) ?? [];

  return (
    <div className="min-h-dvh bg-slate-100">
      <AppNav user={auth.user} dataMode={auth.data_mode} />

      <main className="mx-auto max-w-[1600px] space-y-5 px-4 py-5">
        {/* Header + Controls */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <BarChart3 className="h-5 w-5 text-sky-600" />
                Dashboard Executivo por Setor
              </h1>
              <p className="text-xs text-slate-500">
                Exclusivo Administrador: consolidados mensais e anuais de Água,
                Energia (BSS 1–4), CAG, Temperaturas e Chillers.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor="dash-year"
                className="text-xs font-medium text-slate-600"
              >
                Ano base:
              </label>
              <select
                id="dash-year"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800"
              >
                {(data?.available_years ?? [2026, 2025]).map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {SECTOR_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setSector(tab.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                  sector === tab.value
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {loading && !data ? (
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-20 text-sm text-slate-500 gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
            Calculando indicadores mensais e anuais...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 space-y-2">
            <p>{error}</p>
            <Button size="sm" onClick={() => void loadDashboard()}>
              Tentar novamente
            </Button>
          </div>
        ) : data ? (
          <>
            {/* KPI Cards */}
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Água Geral ({data.selected_year})</span>
                  <Droplets className="h-4 w-4 text-sky-600" />
                </div>
                <div className="text-xl font-bold text-slate-900 tabular-nums">
                  {data.kpis.agua_geral_m3.toLocaleString("pt-BR")} m³
                </div>
                <YoyBadge pct={data.kpis.agua_geral_yoy_pct} />
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Energia Total ({data.selected_year})</span>
                  <Zap className="h-4 w-4 text-amber-500" />
                </div>
                <div className="text-xl font-bold text-slate-900 tabular-nums">
                  {data.kpis.energia_total_kwh.toLocaleString("pt-BR")} kWh
                </div>
                <YoyBadge pct={data.kpis.energia_total_yoy_pct} />
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>CAG Energia ({data.selected_year})</span>
                  <Flame className="h-4 w-4 text-teal-600" />
                </div>
                <div className="text-xl font-bold text-slate-900 tabular-nums">
                  {data.kpis.cag_energia_kwh.toLocaleString("pt-BR")} kWh
                </div>
                <YoyBadge pct={data.kpis.cag_energia_yoy_pct} />
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Temperaturas Médias</span>
                  <Thermometer className="h-4 w-4 text-orange-500" />
                </div>
                <div className="text-xl font-bold text-slate-900 tabular-nums">
                  {data.kpis.temp_externa_avg !== null
                    ? `${data.kpis.temp_externa_avg.toLocaleString("pt-BR")} °C`
                    : "—"}
                </div>
                <div className="text-[11px] text-slate-500">
                  Joquey:{" "}
                  {data.kpis.temp_jockey_avg !== null
                    ? `${data.kpis.temp_jockey_avg.toLocaleString("pt-BR")}°C`
                    : "—"}{" "}
                  &bull; Guaíba:{" "}
                  {data.kpis.temp_guaiba_avg !== null
                    ? `${data.kpis.temp_guaiba_avg.toLocaleString("pt-BR")}°C`
                    : "—"}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Alertas Abertos</span>
                  <AlertTriangle className="h-4 w-4 text-rose-500" />
                </div>
                <div className="text-xl font-bold text-slate-900 tabular-nums">
                  {data.kpis.unacknowledged_alerts}
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant={
                      data.kpis.critical_alerts > 0 ? "danger" : "success"
                    }
                  >
                    {data.kpis.critical_alerts} críticos
                  </Badge>
                </div>
              </div>
            </section>

            {/* ÁGUA */}
            {(sector === "all" || sector === "agua") && (
              <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <GroupedBarChart
                  title="Água Geral — Consumo Mensal"
                  subtitle={`Comparativo ${data.selected_year} vs ${data.previous_year} (m³)`}
                  unit="m³"
                  primaryLabel={String(data.selected_year)}
                  secondaryLabel={String(data.previous_year)}
                  primaryColor="#0284c7"
                  secondaryColor="#cbd5e1"
                  data={data.monthly_series.map((m) => ({
                    label: m.label,
                    primary: m.agua_geral_m3,
                    secondary: m.agua_geral_prev_m3,
                  }))}
                />

                <GroupedBarChart
                  title="Água — Consolidado Anual por Ano"
                  subtitle="Hidrômetro Geral vs Reuso (m³)"
                  unit="m³"
                  primaryLabel="Água Geral"
                  secondaryLabel="Reuso"
                  primaryColor="#0284c7"
                  secondaryColor="#10b981"
                  data={data.annual_series.map((a) => ({
                    label: String(a.year),
                    primary: a.agua_geral_m3,
                    secondary: a.agua_reuso_m3,
                  }))}
                />
              </section>
            )}

            {/* ENERGIA BSS 1..4 */}
            {(sector === "all" || sector === "energia") && (
              <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <GroupedBarChart
                  title="Energia Total (BSS 1–4) — Consumo Mensal"
                  subtitle={`Comparativo ${data.selected_year} vs ${data.previous_year} (kWh)`}
                  unit="kWh"
                  primaryLabel={String(data.selected_year)}
                  secondaryLabel={String(data.previous_year)}
                  primaryColor="#f59e0b"
                  secondaryColor="#cbd5e1"
                  data={data.monthly_series.map((m) => ({
                    label: m.label,
                    primary: m.energia_total_kwh,
                    secondary: m.energia_total_prev_kwh,
                  }))}
                />

                <MultiLineChart
                  title="Energia por Subestação (BSS 1 a 4) — Mensal"
                  subtitle={`Evolução mensal em ${data.selected_year} (kWh)`}
                  unit="kWh"
                  labels={monthLabels}
                  series={[
                    {
                      key: "bss1",
                      label: "BSS 1",
                      color: "#0284c7",
                      values: data.monthly_series.map((m) => m.bss1_kwh),
                    },
                    {
                      key: "bss2",
                      label: "BSS 2",
                      color: "#4f46e5",
                      values: data.monthly_series.map((m) => m.bss2_kwh),
                    },
                    {
                      key: "bss3",
                      label: "BSS 3",
                      color: "#7c3aed",
                      values: data.monthly_series.map((m) => m.bss3_kwh),
                    },
                    {
                      key: "bss4",
                      label: "BSS 4",
                      color: "#0d9488",
                      values: data.monthly_series.map((m) => m.bss4_kwh),
                    },
                  ]}
                />
              </section>
            )}

            {/* PARTICIPAÇÃO E ANUAL ENERGIA */}
            {(sector === "all" || sector === "energia" || sector === "agua") && (
              <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <GroupedBarChart
                  title="Energia — Consolidado Anual (BSS Total vs CAG)"
                  subtitle="Comparação anual em kWh"
                  unit="kWh"
                  primaryLabel="Energia Total"
                  secondaryLabel="CAG Energia"
                  primaryColor="#f59e0b"
                  secondaryColor="#0d9488"
                  data={data.annual_series.map((a) => ({
                    label: String(a.year),
                    primary: a.energia_total_kwh,
                    secondary: a.cag_energia_kwh,
                  }))}
                />

                <SectorShareBars
                  title={`Participação de Energia (${data.selected_year})`}
                  subtitle="Distribuição por subestação BSS 1–4 e CAG"
                  items={data.energy_sector_shares}
                />

                <SectorShareBars
                  title={`Participação de Água (${data.selected_year})`}
                  subtitle="Consumo por ponto hidráulico (m³)"
                  items={data.water_sector_shares}
                />
              </section>
            )}

            {/* CAG */}
            {(sector === "all" || sector === "cag") && (
              <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <GroupedBarChart
                  title="CAG — Energia Mensal (kWh)"
                  subtitle={`Comparativo ${data.selected_year} vs ${data.previous_year}`}
                  unit="kWh"
                  primaryLabel={String(data.selected_year)}
                  secondaryLabel={String(data.previous_year)}
                  primaryColor="#0d9488"
                  secondaryColor="#cbd5e1"
                  data={data.monthly_series.map((m) => ({
                    label: m.label,
                    primary: m.cag_energia_kwh,
                    secondary: m.cag_energia_prev_kwh,
                  }))}
                />

                <GroupedBarChart
                  title="CAG — Água de Reposição Mensal (m³)"
                  subtitle={`Comparativo ${data.selected_year} vs ${data.previous_year}`}
                  unit="m³"
                  primaryLabel={String(data.selected_year)}
                  secondaryLabel={String(data.previous_year)}
                  primaryColor="#6366f1"
                  secondaryColor="#cbd5e1"
                  data={data.monthly_series.map((m) => ({
                    label: m.label,
                    primary: m.cag_agua_m3,
                    secondary: m.cag_agua_prev_m3,
                  }))}
                />
              </section>
            )}

            {/* TEMPERATURAS */}
            {(sector === "all" || sector === "temperaturas") && (
              <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <MultiLineChart
                  title={`Temperaturas Médias Mensais (${data.selected_year})`}
                  subtitle="Externa vs Nível Joquey vs Nível Guaíba (°C)"
                  unit="°C"
                  labels={monthLabels}
                  series={[
                    {
                      key: "ext",
                      label: "Externa",
                      color: "#f97316",
                      values: data.monthly_series.map(
                        (m) => m.temp_externa_avg,
                      ),
                    },
                    {
                      key: "jockey",
                      label: "Nível Joquey",
                      color: "#0284c7",
                      values: data.monthly_series.map((m) => m.temp_jockey_avg),
                    },
                    {
                      key: "guaiba",
                      label: "Nível Guaíba",
                      color: "#10b981",
                      values: data.monthly_series.map((m) => m.temp_guaiba_avg),
                    },
                  ]}
                />

                <GroupedBarChart
                  title="Temperaturas — Média Anual por Setor (°C)"
                  subtitle="Comparativo anual Nível Joquey vs Nível Guaíba"
                  unit="°C"
                  primaryLabel="Nível Joquey"
                  secondaryLabel="Nível Guaíba"
                  primaryColor="#0284c7"
                  secondaryColor="#10b981"
                  data={data.annual_series.map((a) => ({
                    label: String(a.year),
                    primary: a.temp_jockey_avg ?? 0,
                    secondary: a.temp_guaiba_avg ?? 0,
                  }))}
                />
              </section>
            )}

            {/* CHILLERS */}
            {(sector === "all" || sector === "chillers") && (
              <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <MultiLineChart
                  title={`Chillers 1 e 2 — Carga Média do Motor (${data.selected_year})`}
                  subtitle="Percentual médio mensal (%)"
                  unit="%"
                  labels={monthLabels}
                  series={[
                    {
                      key: "c1",
                      label: "Chiller 1 (%)",
                      color: "#06b6d4",
                      values: data.monthly_series.map(
                        (m) => m.chiller1_motor_avg,
                      ),
                    },
                    {
                      key: "c2",
                      label: "Chiller 2 (%)",
                      color: "#6366f1",
                      values: data.monthly_series.map(
                        (m) => m.chiller2_motor_avg,
                      ),
                    },
                  ]}
                />

                <MultiLineChart
                  title={`CAG — Condutivímetro Médio Mensal (${data.selected_year})`}
                  subtitle="Referência: < 700 OK | 700–1000 Alto | > 1000 Crítico (µS/cm)"
                  unit="µS/cm"
                  labels={monthLabels}
                  series={[
                    {
                      key: "cond",
                      label: "Condutivímetro",
                      color: "#e11d48",
                      values: data.monthly_series.map(
                        (m) => m.cag_condutivimetro_avg,
                      ),
                    },
                  ]}
                />
              </section>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
