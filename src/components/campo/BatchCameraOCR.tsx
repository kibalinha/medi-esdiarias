"use client";

import * as React from "react";
import { Camera, CheckCircle2, Loader2, Sparkles, ZoomIn } from "lucide-react";
import type {
  MeterDto,
  MeterGroupDto,
  OcrExtractRequest,
  OcrExtractResponse,
  OcrFieldResultDto,
} from "@/types/contracts";
import { compressFieldPhoto, syncManager } from "@/lib/offline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";

interface BatchCameraOCRProps {
  group: MeterGroupDto;
  meters: MeterDto[];
  readingDate: string;
  onBatchApplied: (payload: {
    localPhotoId: string;
    remotePhotoId: string | null;
    previewUrl: string;
    results: OcrFieldResultDto[];
  }) => void;
}

export function BatchCameraOCR({
  group,
  meters,
  readingDate,
  onBatchApplied,
}: BatchCameraOCRProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    setError(null);
    setStatusMessage(null);

    try {
      const compressed = await compressFieldPhoto(file);
      const localObjUrl = URL.createObjectURL(compressed.blob);
      setPreviewUrl(localObjUrl);

      const isOnline = typeof navigator === "undefined" || navigator.onLine;
      const meterCodes = meters.map((m) => m.code);

      if (isOnline) {
        const reqBody: OcrExtractRequest = {
          image_base64: compressed.dataBase64,
          mime_type: compressed.mimeType,
          group_slug: group.slug,
          meter_ids: meters.map((m) => m.id),
          meter_codes: meterCodes,
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
            groupSlug: group.slug,
            meterCodes,
            runOcrOnSync: false,
            remotePhotoId: ocrData.photo_id,
          });

          const filledCount = ocrData.results.filter(
            (r) => r.extracted_value !== null,
          ).length;

          setStatusMessage(
            `Foto do painel analisada (${Math.round(compressed.sizeBytes / 1024)} KB): ${filledCount} de ${meters.length} campos extraídos.`,
          );

          onBatchApplied({
            localPhotoId: savedPhoto.local_photo_id,
            remotePhotoId: ocrData.photo_id,
            previewUrl: localObjUrl,
            results: ocrData.results,
          });
          return;
        }
      }

      // Offline or OCR endpoint unavailable -> queue photo for deferred OCR on sync
      const savedPhoto = await syncManager.savePendingPhoto({
        blob: compressed.blob,
        dataBase64: compressed.dataBase64,
        mimeType: compressed.mimeType,
        sizeBytes: compressed.sizeBytes,
        groupSlug: group.slug,
        meterCodes,
        runOcrOnSync: true,
        remotePhotoId: null,
      });

      setStatusMessage(
        `Foto salva offline (${Math.round(compressed.sizeBytes / 1024)} KB) para os ${meters.length} campos do painel. Preencha os valores manualmente.`,
      );

      onBatchApplied({
        localPhotoId: savedPhoto.local_photo_id,
        remotePhotoId: null,
        previewUrl: localObjUrl,
        results: [],
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao processar foto do painel.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-950">
            <Sparkles className="h-3.5 w-3.5 text-sky-600" />
            Foto única do painel ({group.name})
          </div>
          <p className="text-[11px] text-sky-800">
            Uma única foto preenche e fica vinculada a todos os medidores deste
            painel (vínculo N:M).
          </p>
        </div>

        <div className="flex items-center gap-2">
          {previewUrl ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoomOpen(true)}
            >
              <ZoomIn className="h-3.5 w-3.5" />
              Ver foto
            </Button>
          ) : null}

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />

          <Button
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
            {busy ? "Processando..." : "Fotografar Painel + OCR"}
          </Button>
        </div>
      </div>

      {statusMessage ? (
        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span>{statusMessage}</span>
          <Badge variant="success">Vinculada ao setor</Badge>
        </div>
      ) : null}

      {error ? (
        <p className="text-xs font-medium text-rose-700">{error}</p>
      ) : null}

      <Modal
        open={zoomOpen && Boolean(previewUrl)}
        onClose={() => setZoomOpen(false)}
        title={`Foto do painel — ${group.name}`}
        maxWidthClass="max-w-2xl"
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={`Painel ${group.name}`}
            className="w-full rounded-lg object-contain max-h-[70dvh]"
          />
        ) : null}
      </Modal>
    </div>
  );
}
