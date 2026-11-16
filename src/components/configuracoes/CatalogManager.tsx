"use client";

import * as React from "react";
import {
  CheckCircle2,
  Loader2,
  Plus,
  Save,
  Sliders,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import type {
  CatalogResponse,
  CatalogUpdateRequest,
  MeterDto,
  MeterGroupDto,
  ReadingKind,
} from "@/types/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface CatalogManagerProps {
  catalog: CatalogResponse;
  onUpdated: () => void;
}

export function CatalogManager({ catalog, onUpdated }: CatalogManagerProps) {
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Editable draft values per meter id
  const [meterEdits, setMeterEdits] = React.useState<
    Record<
      string,
      {
        multiplier_factor: string;
        dial_capacity: string;
        sort_order: string;
        teto_value: string;
        warning_min: string;
        critical_min: string;
      }
    >
  >({});

  // New meter form
  const [showNewMeter, setShowNewMeter] = React.useState(false);
  const [newGroupId, setNewGroupId] = React.useState<string>(
    catalog.groups[0]?.id ?? "",
  );
  const [newCode, setNewCode] = React.useState("");
  const [newHeader, setNewHeader] = React.useState("");
  const [newLabel, setNewLabel] = React.useState("");
  const [newUnit, setNewUnit] = React.useState("°C");
  const [newKind, setNewKind] = React.useState<ReadingKind>("temperature");
  const [newPhotoRequired, setNewPhotoRequired] = React.useState(false);

  React.useEffect(() => {
    const initial: typeof meterEdits = {};
    for (const m of catalog.meters) {
      initial[m.id] = {
        multiplier_factor: String(m.multiplier_factor),
        dial_capacity:
          m.dial_capacity !== null ? String(m.dial_capacity) : "",
        sort_order: String(m.sort_order),
        teto_value:
          m.threshold?.teto_value !== null &&
          m.threshold?.teto_value !== undefined
            ? String(m.threshold.teto_value)
            : "",
        warning_min:
          m.threshold?.warning_min !== null &&
          m.threshold?.warning_min !== undefined
            ? String(m.threshold.warning_min)
            : "",
        critical_min:
          m.threshold?.critical_min !== null &&
          m.threshold?.critical_min !== undefined
            ? String(m.threshold.critical_min)
            : "",
      };
    }
    setMeterEdits(initial);
  }, [catalog.meters]);

  async function patchCatalog(
    payload: CatalogUpdateRequest,
    key: string,
    successMsg: string,
  ) {
    setBusyId(key);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch("/api/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `Erro HTTP ${res.status} ao salvar catálogo.`);
      }
      setFeedback(successMsg);
      onUpdated();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao atualizar catálogo.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleGroup(group: MeterGroupDto) {
    const nextActive = !group.is_active_in_field;
    const groupMeters = catalog.meters.filter((m) => m.group_id === group.id);
    await patchCatalog(
      {
        group_updates: [{ id: group.id, is_active_in_field: nextActive }],
        meter_updates: groupMeters.map((m) => ({
          id: m.id,
          is_active_in_field: nextActive,
        })),
      },
      `group:${group.id}`,
      `Grupo "${group.name}" ${nextActive ? "ativado" : "ocultado"} no Modo Campo.`,
    );
  }

  async function handleToggleMeterField(
    meter: MeterDto,
    field: "is_active_in_field" | "photo_required" | "is_active_in_sheet",
  ) {
    const nextVal = !meter[field];
    await patchCatalog(
      {
        meter_updates: [{ id: meter.id, [field]: nextVal }],
      },
      `meter-toggle:${meter.id}:${field}`,
      `Medidor "${meter.label}" atualizado.`,
    );
  }

  async function handleSaveMeterParams(meter: MeterDto) {
    const draft = meterEdits[meter.id];
    if (!draft) return;
    const mult = Number(draft.multiplier_factor);
    const dial =
      draft.dial_capacity.trim() === "" ? null : Number(draft.dial_capacity);
    const sortOrder = Number(draft.sort_order);

    const payload: CatalogUpdateRequest = {
      meter_updates: [
        {
          id: meter.id,
          multiplier_factor: Number.isFinite(mult) ? mult : 1,
          dial_capacity: dial !== null && Number.isFinite(dial) ? dial : null,
          sort_order: Number.isFinite(sortOrder) ? sortOrder : meter.sort_order,
        },
      ],
    };

    const teto =
      draft.teto_value.trim() === "" ? null : Number(draft.teto_value);
    const warn =
      draft.warning_min.trim() === "" ? null : Number(draft.warning_min);
    const crit =
      draft.critical_min.trim() === "" ? null : Number(draft.critical_min);

    if (teto !== null || warn !== null || crit !== null || meter.threshold) {
      payload.threshold_updates = [
        {
          meter_id: meter.id,
          teto_value: teto !== null && Number.isFinite(teto) ? teto : null,
          warning_min: warn !== null && Number.isFinite(warn) ? warn : null,
          critical_min: crit !== null && Number.isFinite(crit) ? crit : null,
        },
      ];
    }

    await patchCatalog(
      payload,
      `meter-save:${meter.id}`,
      `Parâmetros de "${meter.label}" salvos com sucesso.`,
    );
  }

  async function handleCreateMeter(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroupId || !newCode.trim() || !newLabel.trim()) {
      setError("Preencha grupo, código e rótulo do novo medidor.");
      return;
    }

    await patchCatalog(
      {
        new_meter: {
          group_id: newGroupId,
          code: newCode.trim(),
          excel_header: newHeader.trim() || newLabel.trim(),
          label: newLabel.trim(),
          unit: newUnit.trim() || null,
          reading_kind: newKind,
          photo_required: newPhotoRequired,
          is_active_in_field: true,
          is_active_in_sheet: true,
        },
      },
      "new-meter",
      `Novo medidor "${newLabel.trim()}" cadastrado!`,
    );

    setNewCode("");
    setNewHeader("");
    setNewLabel("");
    setShowNewMeter(false);
  }

  const sortedGroups = [...catalog.groups].sort(
    (a, b) => a.display_order - b.display_order,
  );

  return (
    <div className="space-y-4">
      {feedback ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-900">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          {feedback}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800">
          {error}
        </div>
      ) : null}

      {/* Groups Activation (highlighting Chillers 1 & 2) */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Setores da Ronda (Ativação no Modo Campo)
            </h2>
            <p className="text-xs text-slate-500">
              Chillers 1 e 2 iniciam ocultos no Modo Campo e podem ser ativados a
              qualquer momento sem perder histórico.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowNewMeter((v) => !v)}
          >
            <Plus className="h-4 w-4" />
            Novo Medidor / Loja
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {showNewMeter ? (
            <form
              onSubmit={handleCreateMeter}
              className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 space-y-3"
            >
              <h3 className="text-xs font-bold uppercase tracking-wide text-sky-900">
                Cadastrar Novo Medidor / Loja
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Setor
                  </label>
                  <select
                    value={newGroupId}
                    onChange={(e) => setNewGroupId(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                  >
                    {sortedGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Código único (slug)
                  </label>
                  <Input
                    required
                    placeholder="ex: temp_jockey_16_nova_loja"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Nome amigável (Modo Campo)
                  </label>
                  <Input
                    required
                    placeholder="ex: 16 - Nova Loja"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Cabeçalho na Planilha
                  </label>
                  <Input
                    placeholder="Mesmo do nome amigável se vazio"
                    value={newHeader}
                    onChange={(e) => setNewHeader(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Unidade
                  </label>
                  <Input
                    placeholder="°C, m³, kWh..."
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Tipo de leitura
                  </label>
                  <select
                    value={newKind}
                    onChange={(e) => setNewKind(e.target.value as ReadingKind)}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                  >
                    <option value="temperature">Temperatura</option>
                    <option value="cumulative">Acumulado (delta)</option>
                    <option value="instant">Instantâneo (demanda)</option>
                    <option value="hours">Horas</option>
                    <option value="quality">Qualidade (Condutivímetro)</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newPhotoRequired}
                    onChange={(e) => setNewPhotoRequired(e.target.checked)}
                  />
                  Foto obrigatória em campo
                </label>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowNewMeter(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={busyId === "new-meter"}
                  >
                    {busyId === "new-meter" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Cadastrar Medidor
                  </Button>
                </div>
              </div>
            </form>
          ) : null}

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {sortedGroups.map((group) => {
              const isChiller = group.slug.startsWith("chiller_");
              return (
                <div
                  key={group.id}
                  data-testid={`group-card-${group.slug}`}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${
                    isChiller
                      ? "border-cyan-200 bg-cyan-50/50"
                      : "border-slate-200 bg-slate-50/60"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {group.name}
                      </span>
                      {isChiller ? (
                        <Badge variant="info">2026</Badge>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {group.is_active_in_field
                        ? "Visível no Modo Campo"
                        : "Oculto no Modo Campo"}
                    </p>
                  </div>

                  <button
                    type="button"
                    data-testid={`toggle-group-${group.slug}`}
                    disabled={busyId === `group:${group.id}`}
                    onClick={() => void handleToggleGroup(group)}
                    className="inline-flex items-center gap-1 text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {group.is_active_in_field ? (
                      <ToggleRight className="h-7 w-7 text-emerald-600" />
                    ) : (
                      <ToggleLeft className="h-7 w-7 text-slate-400" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Meters & Thresholds Editor */}
      <Card>
        <CardHeader>
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <Sliders className="h-4 w-4 text-sky-600" />
            Medidores, Tetos de Demanda, Limites e Fatores ({catalog.meters.length})
          </h2>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold text-slate-600">
                <th className="px-3 py-2.5">Medidor / Setor</th>
                <th className="px-3 py-2.5 text-center">Campo</th>
                <th className="px-3 py-2.5 text-center">Foto Obrig.</th>
                <th className="px-3 py-2.5">Fator Mult.</th>
                <th className="px-3 py-2.5">Cap. Visor</th>
                <th className="px-3 py-2.5">Teto / Crítico</th>
                <th className="px-3 py-2.5">Alerta Atenção</th>
                <th className="px-3 py-2.5">Ordem</th>
                <th className="px-3 py-2.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {[...catalog.meters]
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((meter) => {
                  const edit = meterEdits[meter.id] ?? {
                    multiplier_factor: String(meter.multiplier_factor),
                    dial_capacity:
                      meter.dial_capacity !== null
                        ? String(meter.dial_capacity)
                        : "",
                    sort_order: String(meter.sort_order),
                    teto_value: "",
                    warning_min: "",
                    critical_min: "",
                  };

                  return (
                    <tr
                      key={meter.id}
                      className="border-b border-slate-100 hover:bg-slate-50/70"
                    >
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-900">
                          {meter.label}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {meter.group_slug} &bull; {meter.code} (
                          {meter.unit ?? "-"})
                        </div>
                      </td>

                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            void handleToggleMeterField(
                              meter,
                              "is_active_in_field",
                            )
                          }
                          className="cursor-pointer"
                          title="Alternar visibilidade no Modo Campo"
                        >
                          {meter.is_active_in_field ? (
                            <Badge variant="success">Ativo</Badge>
                          ) : (
                            <Badge variant="neutral">Oculto</Badge>
                          )}
                        </button>
                      </td>

                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            void handleToggleMeterField(meter, "photo_required")
                          }
                          className="cursor-pointer"
                          title="Alternar obrigatoriedade de foto"
                        >
                          {meter.photo_required ? (
                            <Badge variant="warning">Sim</Badge>
                          ) : (
                            <Badge variant="outline">Opcional</Badge>
                          )}
                        </button>
                      </td>

                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          step="any"
                          className="h-8 w-20 text-xs"
                          value={edit.multiplier_factor}
                          onChange={(e) =>
                            setMeterEdits((prev) => ({
                              ...prev,
                              [meter.id]: {
                                ...edit,
                                multiplier_factor: e.target.value,
                              },
                            }))
                          }
                        />
                      </td>

                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          step="any"
                          placeholder="-"
                          className="h-8 w-24 text-xs"
                          value={edit.dial_capacity}
                          onChange={(e) =>
                            setMeterEdits((prev) => ({
                              ...prev,
                              [meter.id]: {
                                ...edit,
                                dial_capacity: e.target.value,
                              },
                            }))
                          }
                        />
                      </td>

                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <Input
                            type="number"
                            step="any"
                            placeholder="Teto"
                            title="Teto (Demanda)"
                            className="h-8 w-20 text-xs"
                            value={edit.teto_value}
                            onChange={(e) =>
                              setMeterEdits((prev) => ({
                                ...prev,
                                [meter.id]: {
                                  ...edit,
                                  teto_value: e.target.value,
                                },
                              }))
                            }
                          />
                          <Input
                            type="number"
                            step="any"
                            placeholder="Crít."
                            title="Limite Crítico"
                            className="h-8 w-20 text-xs"
                            value={edit.critical_min}
                            onChange={(e) =>
                              setMeterEdits((prev) => ({
                                ...prev,
                                [meter.id]: {
                                  ...edit,
                                  critical_min: e.target.value,
                                },
                              }))
                            }
                          />
                        </div>
                      </td>

                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          step="any"
                          placeholder="Atenção"
                          className="h-8 w-20 text-xs"
                          value={edit.warning_min}
                          onChange={(e) =>
                            setMeterEdits((prev) => ({
                              ...prev,
                              [meter.id]: {
                                ...edit,
                                warning_min: e.target.value,
                              },
                            }))
                          }
                        />
                      </td>

                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          className="h-8 w-16 text-xs"
                          value={edit.sort_order}
                          onChange={(e) =>
                            setMeterEdits((prev) => ({
                              ...prev,
                              [meter.id]: {
                                ...edit,
                                sort_order: e.target.value,
                              },
                            }))
                          }
                        />
                      </td>

                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === `meter-save:${meter.id}`}
                          onClick={() => void handleSaveMeterParams(meter)}
                        >
                          {busyId === `meter-save:${meter.id}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                          Salvar
                        </Button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
