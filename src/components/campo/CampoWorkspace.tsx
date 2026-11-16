"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
} from "lucide-react";
import type {
  CampoBootstrapResponse,
  OcrFieldResultDto,
} from "@/types/contracts";
import {
  getOfflineDb,
  loadBootstrapCache,
  saveBootstrapCache,
  type DraftReadingRecord,
} from "@/lib/offline";
import { AppNav } from "@/components/ui/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OfflineBadge } from "./OfflineBadge";
import { BatchCameraOCR } from "./BatchCameraOCR";
import { MeterCard, type ExternalOcrPatch } from "./MeterCard";

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

interface CampoWorkspaceProps {
  sectorSlug?: string;
}

export function CampoWorkspace({ sectorSlug }: CampoWorkspaceProps) {
  const [selectedDate, setSelectedDate] = React.useState<string>(todayIsoDate);
  const [bootstrap, setBootstrap] =
    React.useState<CampoBootstrapResponse | null>(null);
  const [draftsByCode, setDraftsByCode] = React.useState<
    Record<string, DraftReadingRecord>
  >({});
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>(
    {},
  );
  const [ocrPatches, setOcrPatches] = React.useState<
    Record<string, ExternalOcrPatch>
  >({});
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [isUsingCache, setIsUsingCache] = React.useState(false);

  const loadDrafts = React.useCallback(async (date: string) => {
    if (typeof window === "undefined") return;
    try {
      const db = getOfflineDb();
      const rows = await db.draftReadings
        .where("reading_date")
        .equals(date)
        .toArray();
      const map: Record<string, DraftReadingRecord> = {};
      for (const r of rows) {
        map[r.meter_code] = r;
      }
      setDraftsByCode(map);
    } catch {
      setDraftsByCode({});
    }
  }, []);

  const fetchBootstrap = React.useCallback(
    async (date: string) => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(
          `/api/campo/bootstrap?date=${encodeURIComponent(date)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data: CampoBootstrapResponse = await res.json();
        setBootstrap(data);
        setIsUsingCache(false);
        await saveBootstrapCache(data);
        setOpenGroups((prev) => {
          if (Object.keys(prev).length > 0) return prev;
          const initial: Record<string, boolean> = {};
          const activeGroups = data.groups.filter((g) => g.is_active_in_field);
          if (activeGroups[0]) {
            initial[activeGroups[0].slug] = true;
          }
          if (sectorSlug) {
            initial[sectorSlug] = true;
          }
          return initial;
        });
      } catch {
        // Offline fallback from IndexedDB
        const cached = await loadBootstrapCache(date);
        if (cached) {
          setBootstrap({
            date: cached.date,
            user: cached.user,
            groups: cached.groups,
            meters: cached.meters,
            previous_readings: cached.previous_readings,
            existing_readings_today: cached.existing_readings_today,
            active_alerts: cached.active_alerts,
          });
          setIsUsingCache(true);
        } else {
          setLoadError(
            "Sem conexão e sem cache local para esta data. Conecte-se uma vez para carregar os medidores.",
          );
        }
      } finally {
        await loadDrafts(date);
        setLoading(false);
      }
    },
    [loadDrafts, sectorSlug],
  );

  React.useEffect(() => {
    void fetchBootstrap(selectedDate);
  }, [selectedDate, fetchBootstrap]);

  // Filter STRICTLY active groups and meters for Field Mode (SPEC 2 & 3.1: Chillers hidden when inactive)
  const activeGroups = React.useMemo(() => {
    if (!bootstrap) return [];
    const sorted = [...bootstrap.groups]
      .filter((g) => g.is_active_in_field)
      .sort((a, b) => a.display_order - b.display_order);
    if (sectorSlug) {
      return sorted.filter((g) => g.slug === sectorSlug);
    }
    return sorted;
  }, [bootstrap, sectorSlug]);

  const activeMetersByGroup = React.useMemo(() => {
    const map: Record<string, CampoBootstrapResponse["meters"]> = {};
    if (!bootstrap) return map;
    const activeGroupSlugs = new Set(activeGroups.map((g) => g.slug));
    for (const meter of bootstrap.meters) {
      if (!meter.is_active_in_field) continue;
      if (!activeGroupSlugs.has(meter.group_slug)) continue;
      if (!map[meter.group_slug]) map[meter.group_slug] = [];
      map[meter.group_slug].push(meter);
    }
    for (const slug of Object.keys(map)) {
      map[slug].sort((a, b) => a.sort_order - b.sort_order);
    }
    return map;
  }, [bootstrap, activeGroups]);

  const allActiveMeters = React.useMemo(() => {
    return Object.values(activeMetersByGroup).flat();
  }, [activeMetersByGroup]);

  const filledCount = React.useMemo(() => {
    if (!bootstrap) return 0;
    return allActiveMeters.filter(
      (m) =>
        Boolean(draftsByCode[m.code]) ||
        Boolean(bootstrap.existing_readings_today[m.code]),
    ).length;
  }, [allActiveMeters, draftsByCode, bootstrap]);

  const totalCount = allActiveMeters.length;
  const progressPct =
    totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0;

  function handleBatchApplied(payload: {
    localPhotoId: string;
    remotePhotoId: string | null;
    previewUrl: string;
    results: OcrFieldResultDto[];
    groupMeters: CampoBootstrapResponse["meters"];
  }) {
    const nonce = Date.now();
    const byCode = new Map(payload.results.map((r) => [r.meter_code, r]));
    setOcrPatches((prev) => {
      const next = { ...prev };
      for (const m of payload.groupMeters) {
        const res = byCode.get(m.code);
        next[m.code] = {
          suggestedValue: res ? res.extracted_value : null,
          confidence: res ? res.confidence : 0,
          localPhotoId: payload.localPhotoId,
          remotePhotoId: payload.remotePhotoId,
          previewUrl: payload.previewUrl,
          nonce,
        };
      }
      return next;
    });
  }

  return (
    <div className="min-h-dvh bg-slate-100 pb-safe">
      <AppNav user={bootstrap?.user ?? null} />

      {/* Sticky Field Header */}
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs shadow-2xs">
        <div className="mx-auto max-w-3xl px-4 py-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {sectorSlug ? (
                <Link href="/campo">
                  <Button variant="outline" size="sm">
                    <ArrowLeft className="h-4 w-4" />
                    Todos os setores
                  </Button>
                </Link>
              ) : null}

              <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700">
                <Calendar className="h-3.5 w-3.5 text-slate-500" />
                <input
                  type="date"
                  aria-label="Data da ronda"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-slate-900 focus:outline-none"
                />
              </label>

              {isUsingCache ? (
                <Badge variant="warning">Cache offline</Badge>
              ) : null}
            </div>

            <OfflineBadge onSyncComplete={() => void fetchBootstrap(selectedDate)} />
          </div>

          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">
                Progresso da ronda ({selectedDate})
              </span>
              <span className="font-semibold tabular-nums text-slate-900">
                {filledCount} / {totalCount} leituras ({progressPct}%)
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-sky-600 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Field Content */}
      <main className="mx-auto max-w-3xl px-4 py-4 space-y-3">
        {loading && !bootstrap ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-500 gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
            Carregando medidores ativos...
          </div>
        ) : loadError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 space-y-2">
            <p>{loadError}</p>
            <Button size="sm" onClick={() => void fetchBootstrap(selectedDate)}>
              Tentar novamente
            </Button>
          </div>
        ) : activeGroups.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
            Nenhum setor ativo encontrado para coleta em campo.
          </div>
        ) : (
          activeGroups.map((group) => {
            const meters = activeMetersByGroup[group.slug] ?? [];
            if (meters.length === 0) return null;

            const groupFilled = meters.filter(
              (m) =>
                Boolean(draftsByCode[m.code]) ||
                Boolean(bootstrap?.existing_readings_today[m.code]),
            ).length;
            const isExpanded = sectorSlug ? true : Boolean(openGroups[group.slug]);

            return (
              <section
                key={group.id}
                data-testid={`sector-${group.slug}`}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"
              >
                <div className="flex items-center justify-between gap-2 bg-slate-50/80 px-4 py-3">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenGroups((prev) => ({
                        ...prev,
                        [group.slug]: !prev[group.slug],
                      }))
                    }
                    className="flex flex-1 items-center gap-2.5 text-left cursor-pointer"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold text-slate-900">
                        {group.name}
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        {groupFilled} de {meters.length} preenchidos
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        groupFilled === meters.length ? "success" : "neutral"
                      }
                    >
                      {groupFilled}/{meters.length}
                    </Badge>
                    {!sectorSlug ? (
                      <Link
                        href={`/campo/setor/${group.slug}`}
                        title={`Abrir tela dedicada de ${group.name}`}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    ) : null}
                  </div>
                </div>

                {isExpanded ? (
                  <div className="border-t border-slate-100 p-3 space-y-3 bg-slate-50/40">
                    {group.allow_batch_photo ? (
                      <BatchCameraOCR
                        group={group}
                        meters={meters}
                        readingDate={selectedDate}
                        onBatchApplied={(payload) =>
                          handleBatchApplied({
                            ...payload,
                            groupMeters: meters,
                          })
                        }
                      />
                    ) : null}

                    {meters.map((meter) => (
                      <MeterCard
                        key={meter.id}
                        meter={meter}
                        readingDate={selectedDate}
                        previousReading={bootstrap?.previous_readings[meter.code]}
                        existingToday={
                          bootstrap?.existing_readings_today[meter.code]
                        }
                        draft={draftsByCode[meter.code]}
                        externalOcrPatch={ocrPatches[meter.code]}
                        onSaved={() => void loadDrafts(selectedDate)}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })
        )}
      </main>
    </div>
  );
}
