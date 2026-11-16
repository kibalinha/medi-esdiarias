import type {
  InputSource,
  SyncBatchRequest,
  SyncBatchResponse,
  SyncPhotoUploadDto,
  SyncReadingMutationDto,
} from "@/types/contracts";
import {
  generateClientUuid,
  getOfflineDb,
  type DraftReadingRecord,
  type PendingPhotoRecord,
  type SyncQueueRecord,
} from "./db";

export interface EnqueueReadingInput {
  readingDate: string;
  meterId: string;
  meterCode: string;
  rawValue: number;
  inputSource: InputSource;
  ocrSuggestedValue?: number | null;
  ocrConfidence?: number | null;
  isRollover?: boolean;
  isMeterReplaced?: boolean;
  replacementBaseline?: number | null;
  notes?: string | null;
  localPhotoIds?: string[];
  photoIds?: string[];
}

export interface SyncStatusSnapshot {
  pendingCount: number;
  failedCount: number;
  isSyncing: boolean;
  lastError: string | null;
  lastSyncedAt: string | null;
}

type SyncListener = (snapshot: SyncStatusSnapshot) => void;

class OfflineSyncManager {
  private isSyncing = false;
  private lastError: string | null = null;
  private lastSyncedAt: string | null = null;
  private listeners = new Set<SyncListener>();
  private initialized = false;

  init(): void {
    if (this.initialized || typeof window === "undefined") return;
    this.initialized = true;

    window.addEventListener("online", () => {
      void this.flushQueue();
    });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "TRIGGER_SYNC") {
          void this.flushQueue();
        }
      });
    }
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    void this.emitSnapshot();
    return () => {
      this.listeners.delete(listener);
    };
  }

  async getSnapshot(): Promise<SyncStatusSnapshot> {
    if (typeof window === "undefined") {
      return {
        pendingCount: 0,
        failedCount: 0,
        isSyncing: false,
        lastError: null,
        lastSyncedAt: null,
      };
    }
    const db = getOfflineDb();
    const all = await db.syncQueue.toArray();
    const pendingCount = all.filter((i) => i.status !== "failed").length;
    const failedCount = all.filter((i) => i.status === "failed").length;
    return {
      pendingCount,
      failedCount,
      isSyncing: this.isSyncing,
      lastError: this.lastError,
      lastSyncedAt: this.lastSyncedAt,
    };
  }

  private async emitSnapshot(): Promise<void> {
    const snap = await this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }

  async savePendingPhoto(params: {
    blob: Blob;
    dataBase64: string;
    mimeType: "image/webp" | "image/jpeg" | "image/png";
    sizeBytes: number;
    groupSlug: string;
    meterCodes: string[];
    runOcrOnSync: boolean;
    remotePhotoId?: string | null;
  }): Promise<PendingPhotoRecord> {
    const db = getOfflineDb();
    const record: PendingPhotoRecord = {
      local_photo_id: generateClientUuid(),
      blob: params.blob,
      data_base64: params.dataBase64,
      mime_type: params.mimeType,
      size_bytes: params.sizeBytes,
      captured_at: new Date().toISOString(),
      group_slug: params.groupSlug,
      meter_codes: params.meterCodes,
      ocr_status: params.runOcrOnSync ? "pending" : "processed",
      remote_photo_id: params.remotePhotoId ?? null,
      uploaded: Boolean(params.remotePhotoId),
    };
    await db.pendingPhotos.put(record);
    return record;
  }

  async enqueueReading(input: EnqueueReadingInput): Promise<{
    mutation: SyncQueueRecord;
    syncResult: SyncBatchResponse | null;
  }> {
    const db = getOfflineDb();
    const now = new Date().toISOString();
    const clientMutationId = generateClientUuid();

    // Remove older unsynced queue entries for the same date+meter so latest value wins cleanly
    const existingForMeter = await db.syncQueue
      .where("meter_code")
      .equals(input.meterCode)
      .filter((item) => item.reading_date === input.readingDate && item.status !== "syncing")
      .toArray();

    const mergedLocalPhotos = new Set<string>(input.localPhotoIds ?? []);
    const mergedRemotePhotos = new Set<string>(input.photoIds ?? []);
    for (const prev of existingForMeter) {
      for (const lp of prev.local_photo_ids) mergedLocalPhotos.add(lp);
      for (const rp of prev.photo_ids) mergedRemotePhotos.add(rp);
      await db.syncQueue.delete(prev.client_mutation_id);
    }

    const mutation: SyncQueueRecord = {
      client_mutation_id: clientMutationId,
      reading_date: input.readingDate,
      meter_id: input.meterId,
      meter_code: input.meterCode,
      raw_value: input.rawValue,
      input_source: input.inputSource,
      ocr_suggested_value: input.ocrSuggestedValue ?? null,
      ocr_confidence: input.ocrConfidence ?? null,
      is_rollover: Boolean(input.isRollover),
      is_meter_replaced: Boolean(input.isMeterReplaced),
      replacement_baseline: input.replacementBaseline ?? null,
      notes: input.notes ?? null,
      local_photo_ids: Array.from(mergedLocalPhotos),
      photo_ids: Array.from(mergedRemotePhotos),
      captured_at: now,
      status: "pending",
      retry_count: 0,
      error_message: null,
      created_at: now,
    };

    await db.syncQueue.put(mutation);

    const draft: DraftReadingRecord = {
      key: `${input.readingDate}:${input.meterCode}`,
      reading_date: input.readingDate,
      meter_id: input.meterId,
      meter_code: input.meterCode,
      raw_value: input.rawValue,
      input_source: input.inputSource,
      ocr_suggested_value: input.ocrSuggestedValue ?? null,
      ocr_confidence: input.ocrConfidence ?? null,
      is_rollover: Boolean(input.isRollover),
      is_meter_replaced: Boolean(input.isMeterReplaced),
      replacement_baseline: input.replacementBaseline ?? null,
      notes: input.notes ?? null,
      local_photo_ids: mutation.local_photo_ids,
      photo_ids: mutation.photo_ids,
      sync_state: "queued",
      server_reading_id: null,
      server_status: "pending_review",
      updated_at: now,
    };

    await db.draftReadings.put(draft);
    await this.requestBackgroundSync();
    await this.emitSnapshot();

    if (typeof navigator !== "undefined" && navigator.onLine) {
      const syncResult = await this.flushQueue();
      return { mutation, syncResult };
    }

    return { mutation, syncResult: null };
  }

  async flushQueue(): Promise<SyncBatchResponse | null> {
    if (typeof window === "undefined") return null;
    if (this.isSyncing) return null;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await this.emitSnapshot();
      return null;
    }

    const db = getOfflineDb();
    const items = await db.syncQueue.orderBy("created_at").toArray();
    if (items.length === 0) {
      await this.emitSnapshot();
      return null;
    }

    this.isSyncing = true;
    this.lastError = null;
    await this.emitSnapshot();

    try {
      // Mark items as syncing
      await Promise.all(
        items.map((item) =>
          db.syncQueue.update(item.client_mutation_id, {
            status: "syncing",
            error_message: null,
          }),
        ),
      );

      // Collect needed local photos that haven't been uploaded yet
      const neededPhotoIds = new Set<string>();
      for (const item of items) {
        for (const lp of item.local_photo_ids) {
          neededPhotoIds.add(lp);
        }
      }

      const photosToUpload: SyncPhotoUploadDto[] = [];
      const alreadyMappedPhotoIds: Record<string, string> = {};

      for (const localPhotoId of neededPhotoIds) {
        const rec = await db.pendingPhotos.get(localPhotoId);
        if (!rec) continue;
        if (rec.uploaded && rec.remote_photo_id) {
          alreadyMappedPhotoIds[localPhotoId] = rec.remote_photo_id;
          continue;
        }
        photosToUpload.push({
          local_photo_id: rec.local_photo_id,
          data_base64: rec.data_base64,
          mime_type: rec.mime_type,
          captured_at: rec.captured_at,
          run_ocr: rec.ocr_status === "pending",
          group_slug: rec.group_slug,
          meter_codes: rec.meter_codes,
        });
      }

      const mutations: SyncReadingMutationDto[] = items.map((item) => {
        const extraRemoteIds = item.local_photo_ids
          .map((lp) => alreadyMappedPhotoIds[lp])
          .filter((id): id is string => Boolean(id));
        const remainingLocalIds = item.local_photo_ids.filter(
          (lp) => !alreadyMappedPhotoIds[lp],
        );

        return {
          client_mutation_id: item.client_mutation_id,
          reading_date: item.reading_date,
          meter_id: item.meter_id,
          meter_code: item.meter_code,
          raw_value: item.raw_value,
          input_source: item.input_source,
          ocr_suggested_value: item.ocr_suggested_value,
          ocr_confidence: item.ocr_confidence,
          is_rollover: item.is_rollover,
          is_meter_replaced: item.is_meter_replaced,
          replacement_baseline: item.replacement_baseline,
          notes: item.notes,
          local_photo_ids: remainingLocalIds,
          photo_ids: Array.from(new Set([...item.photo_ids, ...extraRemoteIds])),
          captured_at: item.captured_at,
        };
      });

      const body: SyncBatchRequest = {
        photos: photosToUpload,
        mutations,
      };

      const res = await fetch("/api/sync/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errPayload = await res.json().catch(() => null);
        const message =
          errPayload?.error || `Erro HTTP ${res.status} ao sincronizar fila.`;
        throw new Error(message);
      }

      const data: SyncBatchResponse = await res.json();

      // Update uploaded photos map
      for (const [localId, remoteId] of Object.entries(
        data.synced_photo_map ?? {},
      )) {
        await db.pendingPhotos.update(localId, {
          uploaded: true,
          remote_photo_id: remoteId,
          ocr_status: "processed",
        });
      }

      // Remove succeeded mutations & update drafts
      for (const result of data.results) {
        const original = items.find(
          (i) => i.client_mutation_id === result.client_mutation_id,
        );
        await db.syncQueue.delete(result.client_mutation_id);
        if (original) {
          const key = `${original.reading_date}:${original.meter_code}`;
          const mappedPhotos = original.local_photo_ids
            .map((lp) => data.synced_photo_map[lp] || alreadyMappedPhotoIds[lp])
            .filter((id): id is string => Boolean(id));

          await db.draftReadings.update(key, {
            sync_state: "synced",
            server_reading_id: result.reading_id,
            server_status: result.status,
            photo_ids: Array.from(
              new Set([...original.photo_ids, ...mappedPhotos]),
            ),
            updated_at: new Date().toISOString(),
          });
        }
      }

      // Mark failed mutations
      for (const fail of data.failed ?? []) {
        const original = items.find(
          (i) => i.client_mutation_id === fail.client_mutation_id,
        );
        await db.syncQueue.update(fail.client_mutation_id, {
          status: "failed",
          retry_count: (original?.retry_count ?? 0) + 1,
          error_message: fail.error,
        });
        if (original) {
          await db.draftReadings.update(
            `${original.reading_date}:${original.meter_code}`,
            { sync_state: "error" },
          );
        }
      }

      // Cleanup uploaded photo blobs no longer referenced by any queued item
      const remainingQueue = await db.syncQueue.toArray();
      const stillReferenced = new Set<string>();
      for (const q of remainingQueue) {
        for (const lp of q.local_photo_ids) stillReferenced.add(lp);
      }
      const allPhotos = await db.pendingPhotos.toArray();
      for (const p of allPhotos) {
        if (p.uploaded && !stillReferenced.has(p.local_photo_id)) {
          await db.pendingPhotos.delete(p.local_photo_id);
        }
      }

      this.lastSyncedAt = data.server_timestamp || new Date().toISOString();
      return data;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Erro ao sincronizar medições.";
      this.lastError = msg;
      await Promise.all(
        items.map((item) =>
          db.syncQueue.update(item.client_mutation_id, {
            status: "failed",
            retry_count: item.retry_count + 1,
            error_message: msg,
          }),
        ),
      );
      return null;
    } finally {
      this.isSyncing = false;
      await this.emitSnapshot();
    }
  }

  async retryFailed(): Promise<SyncBatchResponse | null> {
    const db = getOfflineDb();
    const failed = await db.syncQueue.where("status").equals("failed").toArray();
    await Promise.all(
      failed.map((f) =>
        db.syncQueue.update(f.client_mutation_id, {
          status: "pending",
          error_message: null,
        }),
      ),
    );
    return this.flushQueue();
  }

  private async requestBackgroundSync(): Promise<void> {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      if ("sync" in reg) {
        await (
          reg as ServiceWorkerRegistration & {
            sync: { register: (tag: string) => Promise<void> };
          }
        ).sync.register("medicoes-sync-queue");
      }
    } catch {
      // Background Sync API optional; online listener handles reconnect
    }
  }
}

export const syncManager = new OfflineSyncManager();
