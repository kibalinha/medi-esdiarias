"use client";

import * as React from "react";
import type { DashboardSectorShareDto } from "@/types/contracts";

function formatCompactBr(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString("pt-BR", {
      maximumFractionDigits: 2,
    })}M`;
  }
  if (Math.abs(value) >= 10_000) {
    return `${(value / 1_000).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    })}k`;
  }
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function formatFullBr(value: number, unit: string): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${unit}`.trim();
}

export interface GroupedBarItem {
  label: string;
  primary: number;
  secondary?: number;
}

export function GroupedBarChart({
  title,
  subtitle,
  unit,
  primaryLabel,
  secondaryLabel,
  primaryColor = "#0284c7",
  secondaryColor = "#cbd5e1",
  data,
}: {
  title: string;
  subtitle?: string;
  unit: string;
  primaryLabel: string;
  secondaryLabel?: string;
  primaryColor?: string;
  secondaryColor?: string;
  data: GroupedBarItem[];
}) {
  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);

  const maxVal = Math.max(
    1,
    ...data.flatMap((d) => [d.primary, d.secondary ?? 0]),
  );

  const width = 760;
  const height = 240;
  const padLeft = 52;
  const padRight = 16;
  const padTop = 20;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const slotW = plotW / Math.max(1, data.length);
  const hasSecondary = secondaryLabel !== undefined;
  const isDense = data.length > 15;

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const hovered = hoveredIdx !== null ? data[hoveredIdx] : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {subtitle ? (
            <p className="text-[11px] text-slate-500">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: primaryColor }}
            />
            {primaryLabel}
          </span>
          {hasSecondary ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: secondaryColor }}
              />
              {secondaryLabel}
            </span>
          ) : null}
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible"
          role="img"
          aria-label={title}
        >
          {ticks.map((t) => {
            const y = padTop + plotH * (1 - t);
            const val = maxVal * t;
            return (
              <g key={t}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray={t === 0 ? undefined : "3 3"}
                />
                <text
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px]"
                >
                  {formatCompactBr(val)}
                </text>
              </g>
            );
          })}

          {data.map((d, idx) => {
            const cx = padLeft + slotW * idx + slotW / 2;
            const barW = hasSecondary
              ? Math.min(18, slotW * 0.34)
              : Math.min(28, slotW * 0.56);
            const gap = hasSecondary ? 3 : 0;

            const h1 = (d.primary / maxVal) * plotH;
            const y1 = padTop + plotH - h1;
            const x1 = hasSecondary ? cx - barW - gap / 2 : cx - barW / 2;

            const sec = d.secondary ?? 0;
            const h2 = (sec / maxVal) * plotH;
            const y2 = padTop + plotH - h2;
            const x2 = cx + gap / 2;

            const isHovered = hoveredIdx === idx;

            return (
              <g
                key={d.label}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="cursor-pointer"
              >
                <rect
                  x={padLeft + slotW * idx}
                  y={padTop}
                  width={slotW}
                  height={plotH}
                  fill={isHovered ? "rgba(148,163,184,0.08)" : "transparent"}
                />
                <rect
                  x={x1}
                  y={y1}
                  width={barW}
                  height={Math.max(0, h1)}
                  rx={3}
                  fill={primaryColor}
                  opacity={isHovered ? 1 : 0.9}
                />
                {!isDense && d.primary > 0 ? (
                  <text
                    x={x1 + barW / 2}
                    y={Math.max(12, y1 - 4)}
                    textAnchor="middle"
                    className="fill-slate-700 text-[9px] font-semibold"
                  >
                    {formatCompactBr(d.primary)}
                  </text>
                ) : null}
                {hasSecondary ? (
                  <rect
                    x={x2}
                    y={y2}
                    width={barW}
                    height={Math.max(0, h2)}
                    rx={3}
                    fill={secondaryColor}
                    opacity={isHovered ? 1 : 0.85}
                  />
                ) : null}
                <text
                  x={cx}
                  y={height - 12}
                  textAnchor="middle"
                  className={
                    isDense
                      ? "fill-slate-600 text-[9px] font-medium"
                      : "fill-slate-600 text-[10px] font-medium"
                  }
                >
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>

        {hovered ? (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-700">
            <span className="font-semibold text-slate-900">{hovered.label}</span>
            <div className="flex flex-wrap items-center gap-3">
              <span>
                {primaryLabel}:{" "}
                <strong>{formatFullBr(hovered.primary, unit)}</strong>
              </span>
              {hasSecondary && hovered.secondary !== undefined ? (
                <span>
                  {secondaryLabel}:{" "}
                  <strong>{formatFullBr(hovered.secondary, unit)}</strong>
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export interface MultiLineSeries {
  key: string;
  label: string;
  color: string;
  values: Array<number | null>;
}

export function MultiLineChart({
  title,
  subtitle,
  unit,
  labels,
  series,
}: {
  title: string;
  subtitle?: string;
  unit: string;
  labels: string[];
  series: MultiLineSeries[];
}) {
  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);

  const allValues = series
    .flatMap((s) => s.values)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const minVal = allValues.length > 0 ? Math.min(0, ...allValues) : 0;
  const maxVal =
    allValues.length > 0 ? Math.max(minVal + 1, ...allValues) : 10;
  const span = Math.max(1, maxVal - minVal);

  const width = 760;
  const height = 240;
  const padLeft = 52;
  const padRight = 18;
  const padTop = 20;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const stepX = labels.length > 1 ? plotW / (labels.length - 1) : plotW;
  const isDense = labels.length > 15;

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {subtitle ? (
            <p className="text-[11px] text-slate-500">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible"
          role="img"
          aria-label={title}
        >
          {ticks.map((t) => {
            const y = padTop + plotH * (1 - t);
            const val = minVal + span * t;
            return (
              <g key={t}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray={t === 0 ? undefined : "3 3"}
                />
                <text
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px]"
                >
                  {formatCompactBr(val)}
                </text>
              </g>
            );
          })}

          {series.map((s) => {
            const segments: string[] = [];
            let activeCmd = "M";
            s.values.forEach((v, idx) => {
              if (v === null || !Number.isFinite(v)) {
                activeCmd = "M";
                return;
              }
              const x = padLeft + stepX * idx;
              const y = padTop + plotH - ((v - minVal) / span) * plotH;
              segments.push(`${activeCmd}${x.toFixed(1)},${y.toFixed(1)}`);
              activeCmd = "L";
            });

            return (
              <g key={s.key}>
                {segments.length > 0 ? (
                  <path
                    d={segments.join(" ")}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2.25}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {s.values.map((v, idx) => {
                  if (v === null || !Number.isFinite(v)) return null;
                  const x = padLeft + stepX * idx;
                  const y = padTop + plotH - ((v - minVal) / span) * plotH;
                  return (
                    <circle
                      key={`${s.key}-${idx}`}
                      cx={x}
                      cy={y}
                      r={hoveredIdx === idx ? 4.5 : 3}
                      fill={s.color}
                      stroke="#ffffff"
                      strokeWidth={1.5}
                    />
                  );
                })}
              </g>
            );
          })}

          {labels.map((lbl, idx) => {
            const x = padLeft + stepX * idx;
            return (
              <g
                key={lbl}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="cursor-pointer"
              >
                <rect
                  x={x - stepX / 2}
                  y={padTop}
                  width={stepX}
                  height={plotH}
                  fill="transparent"
                />
                <text
                  x={x}
                  y={height - 12}
                  textAnchor="middle"
                  className={
                    isDense
                      ? "fill-slate-600 text-[9px] font-medium"
                      : "fill-slate-600 text-[10px] font-medium"
                  }
                >
                  {lbl}
                </text>
              </g>
            );
          })}
        </svg>

        {hoveredIdx !== null ? (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-700">
            <span className="font-semibold text-slate-900">
              {labels[hoveredIdx]}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              {series.map((s) => {
                const v = s.values[hoveredIdx];
                return (
                  <span key={s.key}>
                    {s.label}:{" "}
                    <strong>
                      {v !== null && v !== undefined
                        ? formatFullBr(v, unit)
                        : "—"}
                    </strong>
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SectorShareBars({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle?: string;
  items: DashboardSectorShareDto[];
}) {
  const maxVal = Math.max(1, ...items.map((i) => i.value));
  const totalVal = items.reduce((acc, i) => acc + i.value, 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {subtitle ? (
          <p className="text-[11px] text-slate-500">{subtitle}</p>
        ) : null}
      </div>

      <div className="space-y-2.5">
        {items.map((item) => {
          const widthPct = Math.max(2, (item.value / maxVal) * 100);
          const sharePct =
            totalVal > 0 ? ((item.value / totalVal) * 100).toFixed(1) : "0.0";
          return (
            <div key={item.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">{item.label}</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {formatFullBr(item.value, item.unit)}{" "}
                  <span className="text-[11px] font-normal text-slate-400">
                    ({sharePct}%)
                  </span>
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: item.color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
