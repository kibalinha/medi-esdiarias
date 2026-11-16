"use client";

import * as React from "react";
import { CloudOff, RefreshCw, Wifi, AlertTriangle } from "lucide-react";
import { syncManager, type SyncStatusSnapshot } from "@/lib/offline";
import { cn } from "@/components/ui/cn";

export function OfflineBadge({
  onSyncComplete,
}: {
  onSyncComplete?: () => void;
}) {
  const [isOnline, setIsOnline] = React.useState(true);
  const [syncSnap, setSyncSnap] = React.useState<SyncStatusSnapshot>({
    pendingCount: 0,
    failedCount: 0,
    isSyncing: false,
    lastError: null,
    lastSyncedAt: null,
  });

  const onSyncCompleteRef = React.useRef(onSyncComplete);
  onSyncCompleteRef.current = onSyncComplete;
  const lastSyncedAtRef = React.useRef<string | null | undefined>(undefined);

  React.useEffect(() => {
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const unsubscribe = syncManager.subscribe((snap) => {
      setSyncSnap(snap);
      if (lastSyncedAtRef.current === undefined) {
        lastSyncedAtRef.current = snap.lastSyncedAt;
        return;
      }
      if (
        !snap.isSyncing &&
        snap.lastSyncedAt &&
        snap.lastSyncedAt !== lastSyncedAtRef.current
      ) {
        lastSyncedAtRef.current = snap.lastSyncedAt;
        onSyncCompleteRef.current?.();
      }
    });

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsubscribe();
    };
  }, []);

  async function handleManualSync() {
    if (syncSnap.failedCount > 0) {
      await syncManager.retryFailed();
    } else {
      await syncManager.flushQueue();
    }
  }

  const totalQueued = syncSnap.pendingCount + syncSnap.failedCount;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        data-testid="connectivity-pill"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
          !isOnline
            ? "border-amber-300 bg-amber-100 text-amber-900"
            : syncSnap.failedCount > 0
              ? "border-rose-300 bg-rose-100 text-rose-900"
              : totalQueued > 0
                ? "border-sky-300 bg-sky-100 text-sky-900"
                : "border-emerald-300 bg-emerald-100 text-emerald-900",
        )}
      >
        {!isOnline ? (
          <>
            <CloudOff className="h-3.5 w-3.5" />
            <span>
              Offline
              {totalQueued > 0 ? ` - ${totalQueued} ${totalQueued === 1 ? "item" : "itens"} na fila` : ""}
            </span>
          </>
        ) : syncSnap.failedCount > 0 ? (
          <>
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{syncSnap.failedCount} erro(s) na fila</span>
          </>
        ) : totalQueued > 0 ? (
          <>
            <RefreshCw
              className={cn("h-3.5 w-3.5", syncSnap.isSyncing && "animate-spin")}
            />
            <span>
              {syncSnap.isSyncing
                ? "Sincronizando..."
                : `Online - ${totalQueued} pendente(s)`}
            </span>
          </>
        ) : (
          <>
            <Wifi className="h-3.5 w-3.5" />
            <span>Online</span>
          </>
        )}
      </div>

      {isOnline && totalQueued > 0 ? (
        <button
          type="button"
          onClick={handleManualSync}
          disabled={syncSnap.isSyncing}
          className="inline-flex items-center gap-1 rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white shadow-xs hover:bg-sky-700 disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw
            className={cn("h-3 w-3", syncSnap.isSyncing && "animate-spin")}
          />
          Sincronizar agora
        </button>
      ) : null}
    </div>
  );
}
