"use client";

import * as React from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  ShieldAlert,
  ZoomIn,
} from "lucide-react";
import { computeCumulativeDelta } from "@/domain/calculations";
import { evaluateReadingAlerts } from "@/domain/alerts";
import type {
  CampoTodayReadingDto,
  InputSource,
  MeterDto,
  OcrExtractRequest,
  OcrExtractResponse,
  PreviousReadingRefDto,
} from "@/types/contracts";
import type { DraftReadingRecord } from "@/lib/offline";
import { compressFieldPhoto, syncManager } from "@/lib/offline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/components/ui/cn";
import { RolloverModal, type RolloverChoice } from "./RolloverModal";

export interface ExternalOcrPatch {
  suggestedValue: number | null;
  confidence: number;
  localPhotoId: string;
  remotePhotoId: string | null;
  previewUrl: string;
  nonce: number;
}

interface MeterCardProps {
  meter: MeterDto;
  readingDate: string;
  previousReading?: PreviousReadingRefDto;
  existingToday?: CampoTodayReadingDto;
  draft?: DraftReadingRecord;
  externalOcrPatch?: ExternalOcrPatch;
  onSaved: () => void;
}

export function MeterCard({
  meter,
  readingDate,
  previousReading,
  existingToday,
  draft,
  externalOcrPatch,
  onSaved,
}: MeterCardProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const initialRaw =
    draft?.raw_value ?? existingToday?.raw_value ?? null;

  const [valueStr, setValueStr] = React.useState<string>(
    initialRaw !== null && initialRaw !== undefined ? String(initialRaw) : "",
  );
  const [inputSource, setInputSource] = React.useState<InputSource>(
    draft?.input_source ?? existingToday?.input_source ?? "manual",
  );
  const [ocrSuggested, setOcrSuggested] = React.useState<number | null>(
    draft?.ocr_suggested_value ?? existingToday?.ocr_suggested_value ?? null,
  );
  const [ocrConfidence, setOcrConfidence] = React.useState<number | null>(
    draft?.ocr_confidence ?? existingToday?.ocr_confidence ?? null,
  );
  const [rolloverChoice, setRolloverChoice] = React.useState<RolloverChoice>({
    isRollover: draft?.is_rollover ?? existingToday?.is_rollover ?? false,
    isMeterReplaced:
      draft?.is_meter_replaced ?? existingToday?.is_meter_replaced ?? false,
    replacementBaseline:
      draft?.replacement_baseline ??
      existingToday?.replacement_baseline ??
      null,
    notes: draft?.notes ?? existingToday?.notes ?? "",
  });

  const [localPhotoIds, setLocalPhotoIds] = React.useState<string[]>(
    draft?.local_photo_ids ?? [],
  );
  const [remotePhotoIds, setRemotePhotoIds] = React.useState<string[]>(
    draft?.photo_ids ?? existingToday?.photo_ids ?? [],
  );
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = React.useState(false);
  const [rolloverOpen, setRolloverOpen] = React.useState(false);
  const [ocrBusy, setOcrBusy] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [savedFeedback, setSavedFeedback] = React.useState<string | null>(null);

  // Sync when date / draft / server bootstrap updates
  React.useEffect(() => {
    const nextVal = draft?.raw_value ?? existingToday?.raw_value ?? null;
    setValueStr(nextVal !== null && nextVal !== undefined ? String(nextVal) : "");
    setInputSource(draft?.input_source ?? existingToday?.input_source ?? "manual");
    setOcrSuggested(
      draft?.ocr_suggested_value ?? existingToday?.ocr_suggested_value ?? null,
    );
    setOcrConfidence(
      draft?.ocr_confidence ?? existingToday?.ocr_confidence ?? null,
    );
    setRolloverChoice({
      isRollover: draft?.is_rollover ?? existingToday?.is_rollover ?? false,
      isMeterReplaced:
        draft?.is_meter_replaced ?? existingToday?.is_meter_replaced ?? false,
      replacementBaseline:
        draft?.replacement_baseline ??
        existingToday?.replacement_baseline ??
        null,
      notes: draft?.notes ?? existingToday?.notes ?? "",
    });
    setLocalPhotoIds(draft?.local_photo_ids ?? []);
    setRemotePhotoIds(draft?.photo_ids ?? existingToday?.photo_ids ?? []);
    setErrorMsg(null);
    setSavedFeedback(null);
  }, [readingDate, meter.code, draft, existingToday]);

  // Apply external batch OCR patch when received
  React.useEffect(() => {
    if (!externalOcrPatch) return;
    setLocalPhotoIds((prev) =>
      Array.from(new Set([...prev, externalOcrPatch.localPhotoId])),
    );
    if (externalOcrPatch.remotePhotoId) {
      setRemotePhotoIds((prev) =>
        Array.from(new Set([...prev, externalOcrPatch.remotePhotoId!])),
      );
    }
    setPreviewUrl(externalOcrPatch.previewUrl);

    if (externalOcrPatch.suggestedValue !== null) {
      setValueStr(String(externalOcrPatch.suggestedValue));
      setOcrSuggested(externalOcrPatch.suggestedValue);
      setOcrConfidence(externalOcrPatch.confidence);
      setInputSource("ocr");
      setSavedFeedback(null);
    }
  }, [externalOcrPatch]);

  const parsedValue =
    valueStr.trim() === "" ? null : Number(valueStr.replace(",", "."));
  const isValidNumber = parsedValue !== null && Number.isFinite(parsedValue);

  const deltaEval =
    meter.reading_kind === "cumulative" && isValidNumber
      ? computeCumulativeDelta({
          currentValue: parsedValue,
          previousValue: previousReading?.raw_value,
          currentDate: readingDate,
          previousDate: previousReading?.reading_date,
          multiplierFactor: meter.multiplier_factor,
          dialCapacity: meter.dial_capacity,
          isRollover: rolloverChoice.isRollover,
          isMeterReplaced: rolloverChoice.isMeterReplaced,
          replacementBaseline: rolloverChoice.replacementBaseline,
        })
      : null;

  const alertEval = isValidNumber
    ? evaluateReadingAlerts({
        meter,
        rawValue: parsedValue,
        previousValue: previousReading?.raw_value ?? null,
        isDropWithoutFlag: deltaEval?.isDropWithoutFlag ?? false,
      })
    : null;

  const hasPhoto = localPhotoIds.length > 0 || remotePhotoIds.length > 0;
  const isHighOcr =
    ocrSuggested !== null && ocrConfidence !== null && ocrConfidence >= 0.85;
  const isLowOcr =
    ocrSuggested !== null && ocrConfidence !== null && ocrConfidence < 0.85;

  const isSavedLocallyOrServer = Boolean(draft || existingToday);
  const syncState = draft?.sync_state ?? (existingToday ? "synced" : "local_only");

  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setOcrBusy(true);
    setErrorMsg(null);
    setSavedFeedback(null);

    try {
      const compressed = await compressFieldPhoto(file);
      const localObjUrl = URL.createObjectURL(compressed.blob);
      setPreviewUrl(localObjUrl);

      const isOnline = typeof navigator === "undefined" || navigator.onLine;
      if (isOnline) {
        const reqBody: OcrExtractRequest = {
          image_base64: compressed.dataBase64,
          mime_type: compressed.mimeType,
          group_slug: meter.group_slug,
          meter_ids: [meter.id],
          meter_codes: [meter.code],
          reading_date: readingDate,
        };

        const res = await fetch("/api/ocr/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqBody),
        });

        if (res.ok) {
          const ocrData: OcrExtractResponse = await res.json();
          const savedPhoto = await syncManager.savePendingPhoto({
            blob: compressed.blob,
            dataBase64: compressed.dataBase64,
            mimeType: compressed.mimeType,
            sizeBytes: compressed.sizeBytes,
            groupSlug: meter.group_slug,
            meterCodes: [meter.code],
            runOcrOnSync: false,
            remotePhotoId: ocrData.photo_id,
          });

          setLocalPhotoIds((prev) =>
            Array.from(new Set([...prev, savedPhoto.local_photo_id])),
          );
          if (ocrData.photo_id) {
            setRemotePhotoIds((prev) =>
              Array.from(new Set([...prev, ocrData.photo_id!])),
            );
          }

          const match =
            ocrData.results.find((r) => r.meter_code === meter.code) ??
            ocrData.results[0];
          if (match && match.extracted_value !== null) {
            setValueStr(String(match.extracted_value));
            setOcrSuggested(match.extracted_value);
            setOcrConfidence(match.confidence);
            setInputSource("ocr");
          }
          return;
        }
      }

      // Offline fallback: store photo locally and run OCR on sync
      const savedPhoto = await syncManager.savePendingPhoto({
        blob: compressed.blob,
        dataBase64: compressed.dataBase64,
        mimeType: compressed.mimeType,
        sizeBytes: compressed.sizeBytes,
        groupSlug: meter.group_slug,
        meterCodes: [meter.code],
        runOcrOnSync: true,
        remotePhotoId: null,
      });

      setLocalPhotoIds((prev) =>
        Array.from(new Set([...prev, savedPhoto.local_photo_id])),
      );
      setSavedFeedback(
        `Foto salva offline (${Math.round(compressed.sizeBytes / 1024)} KB). Digite o valor do visor.`,
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Falha ao capturar foto.",
      );
    } finally {
      setOcrBusy(false);
    }
  }

  function handleValueChange(nextText: string) {
    setValueStr(nextText);
    setSavedFeedback(null);
    setErrorMsg(null);
    if (ocrSuggested !== null) {
      const nextNum = Number(nextText.replace(",", "."));
      if (Number.isFinite(nextNum) && nextNum === ocrSuggested) {
        setInputSource("ocr");
      } else {
        setInputSource("ocr_edited");
      }
    } else {
      setInputSource("manual");
    }
  }

  async function handleSaveReading(overrideDropWarning = false) {
    setErrorMsg(null);
    if (!isValidNumber || parsedValue === null) {
      setErrorMsg("Informe um valor numérico válido.");
      return;
    }

    if (
      meter.photo_required &&
      !hasPhoto &&
      rolloverChoice.notes.trim().length === 0
    ) {
      setErrorMsg(
        "Foto obrigatória para este medidor. Anexe a foto (ou informe justificativa).",
      );
      return;
    }

    if (deltaEval?.isDropWithoutFlag && !overrideDropWarning) {
      setRolloverOpen(true);
      return;
    }

    setSaving(true);
    try {
      const { syncResult } = await syncManager.enqueueReading({
        readingDate,
        meterId: meter.id,
        meterCode: meter.code,
        rawValue: parsedValue,
        inputSource,
        ocrSuggestedValue: ocrSuggested,
        ocrConfidence,
        isRollover: rolloverChoice.isRollover,
        isMeterReplaced: rolloverChoice.isMeterReplaced,
        replacementBaseline: rolloverChoice.replacementBaseline,
        notes: rolloverChoice.notes || null,
        localPhotoIds,
        photoIds: remotePhotoIds,
      });

      if (syncResult && syncResult.failed.length > 0) {
        setErrorMsg(syncResult.failed[0].error);
      } else if (syncResult && syncResult.results.length > 0) {
        setSavedFeedback("Salvo e sincronizado!");
      } else {
        setSavedFeedback("Salvo localmente na fila offline!");
      }
      onSaved();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Erro ao salvar leitura.",
      );
    } finally {
      setSaving(false);
    }
  }

  const cardHighlightClass =
    alertEval?.highestSeverity === "critical"
      ? "border-rose-400 bg-rose-50/40"
      : alertEval?.highestSeverity === "warning"
        ? "border-amber-400 bg-amber-50/30"
        : isSavedLocallyOrServer
          ? "border-emerald-300 bg-white"
          : "border-slate-200 bg-white";

  return (
    <div
      data-testid={`meter-card-${meter.code}`}
      className={cn(
        "rounded-xl border p-3.5 shadow-2xs transition-colors space-y-2.5",
        cardHighlightClass,
      )}
    >
      {/* Title & Status Badges */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-900">
              {meter.label}
            </h3>
            {meter.unit ? (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                {meter.unit}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>
              Ontem:{" "}
              <strong className="font-semibold text-slate-700">
                {previousReading
                  ? `${previousReading.raw_value.toLocaleString("pt-BR")}${meter.unit ? ` ${meter.unit}` : ""}`
                  : "N/D"}
              </strong>
            </span>
            {meter.threshold?.teto_value ? (
              <span className="text-slate-400">
                &bull; Teto: {meter.threshold.teto_value.toLocaleString("pt-BR")}{" "}
                {meter.unit ?? ""}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {meter.photo_required ? (
            <Badge variant={hasPhoto ? "success" : "warning"}>
              <ImageIcon className="h-3 w-3" />
              {hasPhoto ? "Foto OK" : "Foto obrigatória"}
            </Badge>
          ) : hasPhoto ? (
            <Badge variant="info">
              <ImageIcon className="h-3 w-3" />
              Foto anexa
            </Badge>
          ) : null}

          {syncState === "synced" && isSavedLocallyOrServer ? (
            <Badge variant="success">
              <CheckCircle2 className="h-3 w-3" />
              Sincronizado
            </Badge>
          ) : syncState === "queued" ? (
            <Badge variant="info">
              <Clock className="h-3 w-3" />
              Na fila offline
            </Badge>
          ) : null}
        </div>
      </div>

      {/* OCR Confidence Pill */}
      {ocrSuggested !== null && ocrConfidence !== null ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs bg-slate-50 border-slate-200">
          <div className="flex items-center gap-2">
            <Badge variant={isHighOcr ? "success" : "warning"}>
              OCR {Math.round(ocrConfidence * 100)}%
            </Badge>
            <span className="text-slate-700 font-medium">
              {isHighOcr
                ? "Alta confiança — confirme em 1 toque"
                : "Conferir dígito antes de salvar"}
            </span>
          </div>
          {previewUrl ? (
            <button
              type="button"
              onClick={() => setZoomOpen(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline cursor-pointer"
            >
              <ZoomIn className="h-3.5 w-3.5" />
              Zoom na foto
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Input Row + Camera Button */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            type="number"
            inputMode="decimal"
            step="any"
            aria-label={meter.label}
            data-testid={`input-${meter.code}`}
            placeholder={
              previousReading
                ? `Ex: ${previousReading.raw_value}`
                : "Digite a leitura"
            }
            value={valueStr}
            onChange={(e) => handleValueChange(e.target.value)}
            className={cn(
              "h-11 text-base font-semibold tabular-nums",
              isHighOcr &&
                "border-emerald-400 bg-emerald-50/70 focus:border-emerald-500",
              isLowOcr &&
                "border-amber-400 bg-amber-50/70 focus:border-amber-500",
            )}
          />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhotoCapture}
        />

        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={ocrBusy}
          onClick={() => fileInputRef.current?.click()}
          title="Fotografar medidor e extrair via OCR"
          className="h-11 px-3 shrink-0"
        >
          {ocrBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">Foto / OCR</span>
        </Button>

        <Button
          type="button"
          size="lg"
          variant={isHighOcr ? "success" : "primary"}
          disabled={saving || !isValidNumber}
          onClick={() => void handleSaveReading(false)}
          data-testid={`save-${meter.code}`}
          className="h-11 px-4 shrink-0"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          <span>{isHighOcr ? "Confirmar" : "Salvar"}</span>
        </Button>
      </div>

      {/* Preview of calculated delta for cumulative meters */}
      {deltaEval && deltaEval.delta !== null ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            Consumo previsto:{" "}
            <strong className="text-slate-900">
              {deltaEval.delta.toLocaleString("pt-BR")} {meter.unit ?? ""}
            </strong>
            {deltaEval.isMultiDayDelta ? (
              <span className="ml-1.5 text-amber-700 font-medium">
                (acumulado multi-dias)
              </span>
            ) : null}
          </span>
          {(rolloverChoice.isRollover || rolloverChoice.isMeterReplaced) ? (
            <button
              type="button"
              onClick={() => setRolloverOpen(true)}
              className="inline-flex items-center gap-1 text-sky-700 font-medium hover:underline cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              {rolloverChoice.isRollover ? "Virada marcada" : "Troca marcada"}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Soft-block banner when current < previous without rollover/replacement */}
      {deltaEval?.isDropWithoutFlag && previousReading ? (
        <div
          role="alert"
          className="rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-xs text-rose-900 space-y-2"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <p>
              Leitura menor que a anterior (ontem:{" "}
              <strong>{previousReading.raw_value}</strong>). Confirme se houve
              erro no OCR/digitação ou marque <strong>Virada / Troca</strong> de
              medidor.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="danger"
              onClick={() => setRolloverOpen(true)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Marcar Virada / Troca
            </Button>
          </div>
        </div>
      ) : null}

      {/* Operational Alert Banners (Condutivímetro / Demanda Teto) */}
      {alertEval &&
      alertEval.alerts.filter((a) => a.rule_code !== "QUEDA_MEDIDOR").length >
        0 ? (
        <div className="space-y-1.5">
          {alertEval.alerts
            .filter((a) => a.rule_code !== "QUEDA_MEDIDOR")
            .map((al) => (
              <div
                key={al.rule_code}
                role="alert"
                className={cn(
                  "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium",
                  al.severity === "critical"
                    ? "border-rose-300 bg-rose-100 text-rose-950"
                    : "border-amber-300 bg-amber-100 text-amber-950",
                )}
              >
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{al.message}</span>
              </div>
            ))}
        </div>
      ) : null}

      {/* Inline validation error or save confirmation */}
      {errorMsg ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-rose-700">{errorMsg}</p>
          {meter.photo_required && !hasPhoto ? (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Justificativa para salvar sem foto..."
                value={rolloverChoice.notes}
                onChange={(e) =>
                  setRolloverChoice((prev) => ({ ...prev, notes: e.target.value }))
                }
                className="h-8 text-xs"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {savedFeedback ? (
        <p className="text-xs font-medium text-emerald-700">{savedFeedback}</p>
      ) : null}

      {/* Photo Zoom Modal */}
      <Modal
        open={zoomOpen && Boolean(previewUrl)}
        onClose={() => setZoomOpen(false)}
        title={`Foto — ${meter.label}`}
        maxWidthClass="max-w-2xl"
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={meter.label}
            className="w-full rounded-lg object-contain max-h-[70dvh]"
          />
        ) : null}
      </Modal>

      {/* Rollover / Meter Replacement Modal */}
      {previousReading && parsedValue !== null ? (
        <RolloverModal
          open={rolloverOpen}
          onClose={() => setRolloverOpen(false)}
          meter={meter}
          currentValue={parsedValue}
          previousValue={previousReading.raw_value}
          initialChoice={rolloverChoice}
          onConfirm={(choice) => {
            setRolloverChoice(choice);
          }}
        />
      ) : null}
    </div>
  );
}
