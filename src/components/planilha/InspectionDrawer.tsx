"use client";

import * as React from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Edit3,
  Flag,
  Loader2,
  Lock,
  PlusCircle,
  Sparkles,
  ZoomIn,
} from "lucide-react";
import type {
  CorrectReadingRequest,
  CorrectReadingResponse,
  ReadingDetailResponse,
  ReviewReadingRequest,
  UserRole,
} from "@/types/contracts";
import { Drawer } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { AuditTimeline } from "./AuditTimeline";

export interface EmptyCellTarget {
  readingDate: string;
  meterCode: string;
  columnHeader: string;
  unit: string | null;
}

interface InspectionDrawerProps {
  readingId: string | null;
  emptyTarget: EmptyCellTarget | null;
  columnHeader: string;
  columnKind: "INPUT" | "CALCULATED" | "REFERENCE_YOY" | "CONFIG" | "KEY";
  userRole: UserRole;
  onClose: () => void;
  onMutated: (savedReadingId?: string) => void;
}

export function InspectionDrawer({
  readingId,
  emptyTarget,
  columnHeader,
  columnKind,
  userRole,
  onClose,
  onMutated,
}: InspectionDrawerProps) {
  const [detail, setDetail] = React.useState<ReadingDetailResponse | null>(
    null,
  );
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [actionBusy, setActionBusy] = React.useState(false);

  const [zoomPhotoUrl, setZoomPhotoUrl] = React.useState<string | null>(null);

  // Correction / manual insert form state (ONLY for manager on INPUT readings)
  const [showCorrectForm, setShowCorrectForm] = React.useState(false);
  const [newValue, setNewValue] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [isRollover, setIsRollover] = React.useState(false);
  const [isMeterReplaced, setIsMeterReplaced] = React.useState(false);
  const [replacementBaseline, setReplacementBaseline] = React.useState("0");

  const loadDetail = React.useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/readings/review?reading_id=${encodeURIComponent(id)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const errPayload = await res.json().catch(() => null);
        throw new Error(
          errPayload?.error || `Erro HTTP ${res.status} ao carregar leitura.`,
        );
      }
      const data: ReadingDetailResponse = await res.json();
      setDetail(data);
      setNewValue(String(data.reading.raw_value));
      setIsRollover(data.reading.is_rollover);
      setIsMeterReplaced(data.reading.is_meter_replaced);
      setReplacementBaseline(
        data.reading.replacement_baseline !== null
          ? String(data.reading.replacement_baseline)
          : "0",
      );
      setShowCorrectForm(false);
      setReason("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar detalhes.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (readingId) {
      void loadDetail(readingId);
      return;
    }
    setDetail(null);
    setError(null);
    if (emptyTarget) {
      setNewValue("");
      setReason("");
      setIsRollover(false);
      setIsMeterReplaced(false);
      setReplacementBaseline("0");
      setShowCorrectForm(true);
    }
  }, [readingId, emptyTarget, loadDetail]);

  async function handleReview(action: "approve" | "flag") {
    if (!detail) return;
    setActionBusy(true);
    setError(null);
    try {
      const body: ReviewReadingRequest = {
        reading_id: detail.reading.id,
        action,
        reason:
          action === "flag"
            ? reason.trim() || "Sinalizado para conferência na planilha"
            : undefined,
      };
      const res = await fetch("/api/readings/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errPayload = await res.json().catch(() => null);
        throw new Error(errPayload?.error || "Erro ao atualizar revisão.");
      }
      await loadDetail(detail.reading.id);
      onMutated(detail.reading.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao revisar leitura.");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleCorrectOrInsertSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Number(newValue.replace(",", "."));
    if (newValue.trim() === "" || !Number.isFinite(parsed)) {
      setError("Informe um valor numérico válido.");
      return;
    }

    if (detail && reason.trim().length < 3) {
      setError("Informe uma justificativa clara para a auditoria.");
      return;
    }

    setActionBusy(true);
    setError(null);
    try {
      const body: CorrectReadingRequest = detail
        ? {
            reading_id: detail.reading.id,
            new_value: parsed,
            reason: reason.trim(),
            is_rollover: isRollover,
            is_meter_replaced: isMeterReplaced,
            replacement_baseline: isMeterReplaced
              ? Number(replacementBaseline) || 0
              : null,
          }
        : {
            reading_date: emptyTarget?.readingDate,
            meter_code: emptyTarget?.meterCode,
            new_value: parsed,
            reason: reason.trim() || "Lançamento manual na planilha",
            is_rollover: isRollover,
            is_meter_replaced: isMeterReplaced,
            replacement_baseline: isMeterReplaced
              ? Number(replacementBaseline) || 0
              : null,
          };

      const res = await fetch("/api/readings/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errPayload = await res.json().catch(() => null);
        throw new Error(errPayload?.error || "Erro ao salvar leitura.");
      }
      const saved: CorrectReadingResponse = await res.json();
      await loadDetail(saved.reading_id);
      onMutated(saved.reading_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar leitura.");
    } finally {
      setActionBusy(false);
    }
  }

  const isOpen = Boolean(readingId || emptyTarget);
  const isManager = userRole === "manager";
  const canEditInput = isManager && columnKind === "INPUT";

  return (
    <Drawer
      open={isOpen}
      onClose={onClose}
      title={
        detail
          ? detail.meter.label
          : emptyTarget
            ? emptyTarget.columnHeader
            : columnHeader
      }
      subtitle={
        detail
          ? `Inspeção de Leitura • ${detail.reading.reading_date}`
          : emptyTarget
            ? `Inspeção de Leitura • ${emptyTarget.readingDate} (célula vazia)`
            : "Inspeção de Leitura"
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-12 text-sm text-slate-500 gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
          Carregando inspeção...
        </div>
      ) : error && !detail && !emptyTarget ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          {error}
        </div>
      ) : emptyTarget && !detail ? (
        <div className="space-y-4">
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="rounded-xl border border-dashed border-sky-300 bg-sky-50/60 p-4 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-900">
              <PlusCircle className="h-4 w-4 text-sky-600" />
              Célula sem leitura lançada em {emptyTarget.readingDate}
            </div>
            <p className="text-xs text-slate-600">
              Insira o valor bruto ({emptyTarget.unit ?? "unid."}) diretamente
              abaixo. Os cálculos e alertas serão atualizados automaticamente.
            </p>
          </div>

          {!canEditInput ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Lock className="h-4 w-4 shrink-0" />
              Apenas o Gestor pode lançar valores manuais em células INPUT.
            </div>
          ) : (
            <form
              onSubmit={handleCorrectOrInsertSubmit}
              className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">
                  Valor bruto ({emptyTarget.unit ?? "unid."})
                </label>
                <Input
                  type="number"
                  step="any"
                  required
                  autoFocus
                  placeholder="Digite o valor..."
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-4 text-xs text-slate-700">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isRollover}
                    onChange={(e) => setIsRollover(e.target.checked)}
                  />
                  Virada de medidor (Rollover)
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isMeterReplaced}
                    onChange={(e) => setIsMeterReplaced(e.target.checked)}
                  />
                  Medidor trocado
                </label>
              </div>

              {isMeterReplaced ? (
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Baseline do medidor novo
                  </label>
                  <Input
                    type="number"
                    step="any"
                    value={replacementBaseline}
                    onChange={(e) => setReplacementBaseline(e.target.value)}
                  />
                </div>
              ) : null}

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">
                  Observação / justificativa (opcional)
                </label>
                <Input
                  placeholder="Ex.: Lançamento manual na planilha"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={onClose}>
                  Fechar
                </Button>
                <Button type="submit" size="sm" disabled={actionBusy}>
                  {actionBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Salvar leitura
                </Button>
              </div>
            </form>
          )}
        </div>
      ) : detail ? (
        <div className="space-y-5">
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
              {error}
            </div>
          ) : null}

          {/* Summary Value + Status */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">
                Valor bruto registrado (INPUT)
              </span>
              <Badge
                variant={
                  detail.reading.status === "approved"
                    ? "success"
                    : detail.reading.status === "flagged"
                      ? "warning"
                      : "info"
                }
              >
                {detail.reading.status === "approved"
                  ? "Aprovada"
                  : detail.reading.status === "flagged"
                    ? "Sinalizada"
                    : "Pendente de revisão"}
              </Badge>
            </div>

            <div className="flex items-baseline justify-between gap-3">
              <div className="text-2xl font-bold tabular-nums text-slate-900">
                {detail.reading.raw_value.toLocaleString("pt-BR")}{" "}
                <span className="text-sm font-normal text-slate-500">
                  {detail.meter.unit ?? ""}
                </span>
              </div>
              {detail.previous_reading ? (
                <span className="text-xs text-slate-500">
                  Anterior ({detail.previous_reading.reading_date}):{" "}
                  <strong>
                    {detail.previous_reading.raw_value.toLocaleString("pt-BR")}
                  </strong>
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-600">
              <Badge variant="outline">
                Origem: {detail.reading.input_source}
              </Badge>
              {detail.reading.is_rollover ? (
                <Badge variant="info">Virada de medidor</Badge>
              ) : null}
              {detail.reading.is_meter_replaced ? (
                <Badge variant="info">Medidor trocado</Badge>
              ) : null}
            </div>
          </div>

          {/* OCR Extraction Details */}
          {detail.reading.ocr_suggested_value !== null ||
          detail.reading.ocr_confidence !== null ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-sky-900">
                  <Sparkles className="h-3.5 w-3.5 text-sky-600" />
                  Extração OCR (Gemini Vision)
                </span>
                {detail.reading.ocr_confidence !== null ? (
                  <Badge
                    variant={
                      detail.reading.ocr_confidence >= 0.85
                        ? "success"
                        : "warning"
                    }
                  >
                    Confiança{" "}
                    {Math.round(detail.reading.ocr_confidence * 100)}%
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-slate-700">
                Valor sugerido pelo OCR:{" "}
                <strong className="tabular-nums">
                  {detail.reading.ocr_suggested_value !== null
                    ? detail.reading.ocr_suggested_value.toLocaleString("pt-BR")
                    : "N/D"}
                </strong>
              </p>
            </div>
          ) : null}

          {/* Active Alerts on Reading */}
          {detail.alerts.length > 0 ? (
            <div className="space-y-1.5">
              {detail.alerts.map((al) => (
                <div
                  key={al.id}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                    al.severity === "critical"
                      ? "border-rose-300 bg-rose-50 text-rose-900"
                      : "border-amber-300 bg-amber-50 text-amber-900"
                  }`}
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{al.message}</span>
                </div>
              ))}
            </div>
          ) : null}

          {/* Attached Field Photos */}
          <div className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Camera className="h-3.5 w-3.5" />
              Fotos Vinculadas ({detail.photos.length})
            </h3>
            {detail.photos.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500">
                Nenhuma foto anexada a esta leitura.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {detail.photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.signed_url}
                      alt={`Foto ${detail.meter.label}`}
                      className="h-40 w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setZoomPhotoUrl(photo.signed_url)}
                      className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-lg bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-slate-900 cursor-pointer"
                    >
                      <ZoomIn className="h-3 w-3" />
                      Ampliar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Manager Actions: Approve / Flag / Correct INPUT */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Revisão &amp; Correção
            </h3>

            {!isManager ? (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Lock className="h-4 w-4 shrink-0" />
                Apenas o Gestor pode aprovar ou corrigir leituras pela planilha.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="success"
                    size="sm"
                    disabled={actionBusy}
                    onClick={() => void handleReview("approve")}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Aprovar leitura
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionBusy}
                    onClick={() => void handleReview("flag")}
                  >
                    <Flag className="h-4 w-4 text-amber-600" />
                    Sinalizar pendência
                  </Button>

                  {canEditInput ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={actionBusy}
                      onClick={() => setShowCorrectForm((v) => !v)}
                    >
                      <Edit3 className="h-4 w-4" />
                      Corrigir leitura bruta
                    </Button>
                  ) : null}
                </div>

                {showCorrectForm && canEditInput ? (
                  <form
                    onSubmit={handleCorrectOrInsertSubmit}
                    className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-700">
                        Novo valor bruto ({detail.meter.unit ?? "unid."})
                      </label>
                      <Input
                        type="number"
                        step="any"
                        required
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                      />
                    </div>

                    <div className="flex flex-wrap gap-4 text-xs text-slate-700">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isRollover}
                          onChange={(e) => setIsRollover(e.target.checked)}
                        />
                        Virada de medidor (Rollover)
                      </label>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isMeterReplaced}
                          onChange={(e) => setIsMeterReplaced(e.target.checked)}
                        />
                        Medidor trocado
                      </label>
                    </div>

                    {isMeterReplaced ? (
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-slate-700">
                          Baseline do medidor novo
                        </label>
                        <Input
                          type="number"
                          step="any"
                          value={replacementBaseline}
                          onChange={(e) =>
                            setReplacementBaseline(e.target.value)
                          }
                        />
                      </div>
                    ) : null}

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-700">
                        Justificativa obrigatória (auditoria)
                      </label>
                      <Input
                        required
                        placeholder="Ex.: Dígito 8 lido como 3 pelo OCR na foto"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowCorrectForm(false)}
                      >
                        Cancelar
                      </Button>
                      <Button type="submit" size="sm" disabled={actionBusy}>
                        {actionBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        Salvar correção
                      </Button>
                    </div>
                  </form>
                ) : null}
              </>
            )}
          </div>

          {/* Audit Timeline */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Histórico de Auditoria
            </h3>
            <AuditTimeline logs={detail.audit_logs} />
          </div>
        </div>
      ) : null}

      <Modal
        open={Boolean(zoomPhotoUrl)}
        onClose={() => setZoomPhotoUrl(null)}
        title="Foto original do medidor"
        maxWidthClass="max-w-3xl"
      >
        {zoomPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={zoomPhotoUrl}
            alt="Foto ampliada"
            className="w-full rounded-lg object-contain max-h-[75dvh]"
          />
        ) : null}
      </Modal>
    </Drawer>
  );
}
