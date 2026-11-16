"use client";

import * as React from "react";
import { RotateCcw, Wrench } from "lucide-react";
import { computeCumulativeDelta, inferDialCapacity } from "@/domain/calculations";
import type { MeterDto } from "@/types/contracts";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface RolloverChoice {
  isRollover: boolean;
  isMeterReplaced: boolean;
  replacementBaseline: number | null;
  notes: string;
}

interface RolloverModalProps {
  open: boolean;
  onClose: () => void;
  meter: MeterDto;
  currentValue: number;
  previousValue: number;
  initialChoice: RolloverChoice;
  onConfirm: (choice: RolloverChoice) => void;
}

export function RolloverModal({
  open,
  onClose,
  meter,
  currentValue,
  previousValue,
  initialChoice,
  onConfirm,
}: RolloverModalProps) {
  const [mode, setMode] = React.useState<"rollover" | "replaced">(
    initialChoice.isMeterReplaced ? "replaced" : "rollover",
  );
  const [baseline, setBaseline] = React.useState<string>(
    initialChoice.replacementBaseline !== null
      ? String(initialChoice.replacementBaseline)
      : "0",
  );
  const [notes, setNotes] = React.useState<string>(initialChoice.notes);

  React.useEffect(() => {
    if (!open) return;
    setMode(initialChoice.isMeterReplaced ? "replaced" : "rollover");
    setBaseline(
      initialChoice.replacementBaseline !== null
        ? String(initialChoice.replacementBaseline)
        : "0",
    );
    setNotes(initialChoice.notes);
  }, [open, initialChoice]);

  const effectiveDialCapacity =
    meter.dial_capacity ?? inferDialCapacity(previousValue);

  const previewDelta = computeCumulativeDelta({
    currentValue,
    previousValue,
    multiplierFactor: meter.multiplier_factor,
    dialCapacity: effectiveDialCapacity,
    isRollover: mode === "rollover",
    isMeterReplaced: mode === "replaced",
    replacementBaseline: Number(baseline) || 0,
  });

  function handleSave() {
    onConfirm({
      isRollover: mode === "rollover",
      isMeterReplaced: mode === "replaced",
      replacementBaseline: mode === "replaced" ? Number(baseline) || 0 : null,
      notes: notes.trim(),
    });
    onClose();
  }

  function handleClearFlags() {
    onConfirm({
      isRollover: false,
      isMeterReplaced: false,
      replacementBaseline: null,
      notes: notes.trim(),
    });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Virada ou Troca — ${meter.label}`}
      description={`Leitura atual (${currentValue}) menor que a anterior (${previousValue}). Selecione o motivo real em campo.`}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode("rollover")}
            className={`flex flex-col gap-1 rounded-xl border-2 p-3 text-left transition cursor-pointer ${
              mode === "rollover"
                ? "border-sky-600 bg-sky-50"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <RotateCcw className="h-4 w-4 text-sky-600" />
              Virada do Medidor (Rollover)
            </div>
            <p className="text-xs text-slate-600">
              Visor zerou após atingir a capacidade ({effectiveDialCapacity}).
            </p>
          </button>

          <button
            type="button"
            onClick={() => setMode("replaced")}
            className={`flex flex-col gap-1 rounded-xl border-2 p-3 text-left transition cursor-pointer ${
              mode === "replaced"
                ? "border-indigo-600 bg-indigo-50"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Wrench className="h-4 w-4 text-indigo-600" />
              Troca de Medidor
            </div>
            <p className="text-xs text-slate-600">
              Equipamento substituído com novo valor inicial (baseline).
            </p>
          </button>
        </div>

        {mode === "replaced" ? (
          <div className="space-y-1">
            <label
              htmlFor="replacement-baseline"
              className="block text-xs font-medium text-slate-700"
            >
              Leitura inicial do medidor novo (baseline)
            </label>
            <Input
              id="replacement-baseline"
              type="number"
              step="any"
              value={baseline}
              onChange={(e) => setBaseline(e.target.value)}
            />
          </div>
        ) : (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            Fórmula aplicada: ({effectiveDialCapacity} &minus; {previousValue} +{" "}
            {currentValue}) &times; {meter.multiplier_factor}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600">
            Consumo calculado previsto:
          </span>
          <span className="text-base font-bold text-slate-900">
            {previewDelta.delta !== null
              ? `${previewDelta.delta.toLocaleString("pt-BR")} ${meter.unit ?? ""}`
              : "-"}
          </span>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="rollover-notes"
            className="block text-xs font-medium text-slate-700"
          >
            Observação (opcional)
          </label>
          <Input
            id="rollover-notes"
            placeholder="Ex.: Relógio de 4 dígitos virou na madrugada"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          {(initialChoice.isRollover || initialChoice.isMeterReplaced) ? (
            <Button variant="outline" size="sm" onClick={handleClearFlags}>
              Remover marcação
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>Confirmar marcação</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
