"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Calculator,
  Camera,
  Check,
  Eye,
  History,
  Lock,
  Pencil,
  Sliders,
  X,
} from "lucide-react";
import type {
  PlanilhaCellDto,
  PlanilhaRowDto,
  SpreadsheetColumnDefDto,
  UserRole,
} from "@/types/contracts";
import { cn } from "@/components/ui/cn";

export interface InlineSavePayload {
  readingDate: string;
  cell: PlanilhaCellDto | undefined;
  col: SpreadsheetColumnDefDto;
  newValue: number;
}

interface ExcelGridProps {
  columns: SpreadsheetColumnDefDto[];
  rows: PlanilhaRowDto[];
  userRole: UserRole;
  quickEditMode?: boolean;
  onSelectCell: (
    readingDate: string,
    cell: PlanilhaCellDto | undefined,
    col: SpreadsheetColumnDefDto,
  ) => void;
  onInlineSave: (payload: InlineSavePayload) => Promise<void>;
}

const GROUP_COLOR_CLASSES: Record<string, string> = {
  agua: "bg-sky-900 text-white",
  temp_externa: "bg-amber-900 text-white",
  temp_jockey: "bg-amber-800 text-white",
  temp_guaiba: "bg-orange-800 text-white",
  bss_1: "bg-indigo-900 text-white",
  bss_2: "bg-indigo-800 text-white",
  bss_3: "bg-violet-900 text-white",
  bss_4: "bg-violet-800 text-white",
  bss_total: "bg-slate-900 text-white",
  chiller_1: "bg-cyan-900 text-white",
  chiller_2: "bg-cyan-800 text-white",
  cag: "bg-teal-900 text-white",
};

function formatDateBr(iso: string): string {
  const parts = iso.slice(0, 10).split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function ExcelGrid({
  columns,
  rows,
  userRole,
  quickEditMode = false,
  onSelectCell,
  onInlineSave,
}: ExcelGridProps) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const clickTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const [editingValue, setEditingValue] = React.useState<string>("");
  const [savingKey, setSavingKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    return () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  const isManager = userRole === "manager";

  // Ensure chronological ascending order: 01/01 at top -> 31/12 at bottom
  const orderedRows = React.useMemo(() => {
    return [...rows].sort((a, b) =>
      a.reading_date.localeCompare(b.reading_date),
    );
  }, [rows]);

  const startInlineEdit = React.useCallback(
    (
      readingDate: string,
      cell: PlanilhaCellDto | undefined,
      col: SpreadsheetColumnDefDto,
    ) => {
      if (!isManager || col.kind !== "INPUT" || !col.meter_code) return;
      const key = `${readingDate}:${col.key}`;
      setEditingKey(key);
      setEditingValue(
        cell?.value !== null && cell?.value !== undefined
          ? String(cell.value)
          : "",
      );
    },
    [isManager],
  );

  const cancelInlineEdit = React.useCallback(() => {
    setEditingKey(null);
    setEditingValue("");
  }, []);

  const commitInlineEdit = React.useCallback(
    async (
      readingDate: string,
      cell: PlanilhaCellDto | undefined,
      col: SpreadsheetColumnDefDto,
      nextCol?: SpreadsheetColumnDefDto,
      nextCell?: PlanilhaCellDto,
    ) => {
      const trimmed = editingValue.trim();
      const parsed = Number(editingValue.replace(",", "."));
      if (trimmed !== "" && Number.isFinite(parsed)) {
        const key = `${readingDate}:${col.key}`;
        setSavingKey(key);
        try {
          await onInlineSave({
            readingDate,
            cell,
            col,
            newValue: parsed,
          });
        } finally {
          setSavingKey(null);
        }
      } else if (!nextCol) {
        return;
      }

      if (nextCol) {
        startInlineEdit(readingDate, nextCell, nextCol);
      } else {
        setEditingKey(null);
        setEditingValue("");
      }
    },
    [editingValue, onInlineSave, startInlineEdit],
  );

  const tableColumns = React.useMemo<ColumnDef<PlanilhaRowDto>[]>(() => {
    return columns.map((col) => ({
      id: col.key,
      header: () => col.header,
      size: col.kind === "KEY" ? 118 : 156,
      cell: ({ row }) => {
        const original = row.original;
        if (col.kind === "KEY") {
          return (
            <div className="flex items-center justify-between gap-1 font-semibold tabular-nums text-slate-900">
              <span>{formatDateBr(original.reading_date)}</span>
              {original.highest_alert_severity === "critical" ? (
                <span
                  title="Alerta crítico neste dia"
                  className="h-2 w-2 rounded-full bg-rose-600 shrink-0"
                />
              ) : original.highest_alert_severity === "warning" ? (
                <span
                  title="Alerta de atenção neste dia"
                  className="h-2 w-2 rounded-full bg-amber-500 shrink-0"
                />
              ) : original.has_pending ? (
                <span
                  title="Leitura pendente de revisão"
                  className="h-2 w-2 rounded-full bg-sky-500 shrink-0"
                />
              ) : null}
            </div>
          );
        }

        const cell = original.cells[col.key];
        const isInput = col.kind === "INPUT";
        const isFormula =
          col.kind === "CALCULATED" ||
          col.kind === "REFERENCE_YOY" ||
          col.kind === "CONFIG";

        const cellEditKey = `${original.reading_date}:${col.key}`;
        if (isInput && editingKey === cellEditKey) {
          const isSaving = savingKey === cellEditKey;
          return (
            <div
              className="flex items-center gap-1 w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="number"
                step="any"
                autoFocus
                disabled={isSaving}
                aria-label={`Editar ${col.header} em ${original.reading_date}`}
                data-testid={`inline-input-${original.reading_date}-${col.key}`}
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitInlineEdit(original.reading_date, cell, col);
                  } else if (e.key === "Tab") {
                    e.preventDefault();
                    const inputCols = columns.filter(
                      (c) => c.kind === "INPUT" && Boolean(c.meter_code),
                    );
                    const currentIdx = inputCols.findIndex(
                      (c) => c.key === col.key,
                    );
                    const nextCol = e.shiftKey
                      ? inputCols[currentIdx - 1]
                      : inputCols[currentIdx + 1];
                    const nextCell = nextCol
                      ? original.cells[nextCol.key]
                      : undefined;
                    void commitInlineEdit(
                      original.reading_date,
                      cell,
                      col,
                      nextCol,
                      nextCell,
                    );
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelInlineEdit();
                  }
                }}
                className="h-7 w-full min-w-[74px] rounded border border-sky-500 bg-white px-1.5 text-xs font-semibold tabular-nums text-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
              />
              <button
                type="button"
                disabled={isSaving}
                title="Salvar valor (Enter)"
                aria-label="Salvar célula"
                onClick={() =>
                  void commitInlineEdit(original.reading_date, cell, col)
                }
                className="rounded bg-emerald-600 p-1 text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer shrink-0"
              >
                <Check className="h-3 w-3" />
              </button>
              <button
                type="button"
                disabled={isSaving}
                title="Cancelar (Esc)"
                aria-label="Cancelar edição"
                onClick={cancelInlineEdit}
                className="rounded bg-slate-200 p-1 text-slate-700 hover:bg-slate-300 cursor-pointer shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        }

        const isEmptyInput =
          isInput &&
          (!cell || cell.value === null || cell.value === undefined);

        if (!cell && !isInput) {
          return <span className="text-slate-300">-</span>;
        }

        return (
          <div className="flex items-center justify-between gap-1 w-full">
            {isEmptyInput ? (
              <span className="inline-flex items-center rounded border border-dashed border-sky-300/80 bg-sky-50/50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700/85">
                + Preencher
              </span>
            ) : (
              <span
                className={cn(
                  "truncate tabular-nums",
                  isFormula ? "text-slate-700" : "font-medium text-slate-950",
                )}
                title={cell?.formatted ?? ""}
              >
                {cell?.formatted ?? "-"}
              </span>
            )}

            <span className="flex items-center gap-0.5 shrink-0">
              {cell?.is_rollover ? (
                <span
                  title="Virada de medidor (Rollover)"
                  className="rounded bg-sky-100 px-1 text-[9px] font-bold text-sky-800"
                >
                  V
                </span>
              ) : null}
              {cell?.is_meter_replaced ? (
                <span
                  title="Troca de medidor"
                  className="rounded bg-indigo-100 px-1 text-[9px] font-bold text-indigo-800"
                >
                  T
                </span>
              ) : null}
              {cell?.is_multi_day_delta ? (
                <span
                  title="Delta acumulado multi-dias"
                  className="rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-800"
                >
                  +d
                </span>
              ) : null}
              {cell?.is_anomaly ? (
                <span
                  title="Anomalia de cálculo / >100%"
                  className="rounded bg-rose-100 px-1 text-[9px] font-bold text-rose-800"
                >
                  !
                </span>
              ) : null}
              {isInput && cell?.has_photos ? (
                <Camera
                  className="h-3 w-3 text-slate-400"
                  aria-label="Possui foto"
                />
              ) : null}
              {isInput && quickEditMode && (cell?.reading_id || isManager) ? (
                <button
                  type="button"
                  title="Inspecionar foto, OCR e auditoria"
                  aria-label={`Inspecionar ${col.header} em ${original.reading_date}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectCell(original.reading_date, cell, col);
                  }}
                  className="opacity-60 group-hover/cell:opacity-100 focus:opacity-100 rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition-opacity cursor-pointer"
                >
                  <Eye className="h-3 w-3" />
                </button>
              ) : null}
              {isInput && isManager && col.meter_code ? (
                <button
                  type="button"
                  title={
                    quickEditMode
                      ? "Clique na célula para editar"
                      : "Editar valor inline (duplo-clique na célula)"
                  }
                  aria-label={`Editar ${col.header} em ${original.reading_date}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    startInlineEdit(original.reading_date, cell, col);
                  }}
                  className="opacity-50 group-hover/cell:opacity-100 focus:opacity-100 rounded p-0.5 text-slate-500 hover:bg-sky-100 hover:text-sky-700 transition-opacity cursor-pointer"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              ) : null}
            </span>
          </div>
        );
      },
    }));
  }, [
    columns,
    editingKey,
    editingValue,
    savingKey,
    isManager,
    quickEditMode,
    startInlineEdit,
    cancelInlineEdit,
    commitInlineEdit,
    onSelectCell,
  ]);

  const table = useReactTable({
    data: orderedRows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const tableRows = table.getRowModel().rows;

  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 36,
    overscan: 16,
  });

  React.useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    rowVirtualizer.measure();
  }, [tableRows.length, rowVirtualizer]);

  const headerGroupsLevel1 = React.useMemo(() => {
    const groups: Array<{
      id: string;
      slug: string;
      name: string;
      colSpan: number;
      isKeyGroup: boolean;
    }> = [];

    for (const col of columns) {
      if (col.kind === "KEY") {
        groups.push({
          id: `grp-${col.key}`,
          slug: col.group_slug,
          name: "Chave",
          colSpan: 1,
          isKeyGroup: true,
        });
        continue;
      }
      const last = groups[groups.length - 1];
      if (last && !last.isKeyGroup && last.slug === col.group_slug) {
        last.colSpan += 1;
      } else {
        groups.push({
          id: `grp-${col.group_slug}-${col.col_index}`,
          slug: col.group_slug,
          name: col.group_name,
          colSpan: 1,
          isKeyGroup: false,
        });
      }
    }
    return groups;
  }, [columns]);

  const colByKey = React.useMemo(() => {
    return new Map(columns.map((c) => [c.key, c]));
  }, [columns]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? totalHeight - virtualRows[virtualRows.length - 1].end
      : 0;

  if (columns.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Nenhuma coluna selecionada para exibição.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-xs">
      {/* Legend Bar for INPUT vs CALCULATED */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-slate-300 bg-white" />
            <strong>INPUT</strong>{" "}
            {quickEditMode
              ? "(Edição Rápida ativa: 1 clique edita na célula • Tab avança)"
              : "(clique para inspecionar/lançar • duplo-clique ou lápis para editar na célula)"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-slate-300 bg-slate-200" />
            <Calculator className="h-3 w-3 text-slate-500" />
            <strong>CALCULATED / YoY</strong> (automático — bloqueado para edição)
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-slate-500">Ordem: 01/01 &darr; 31/12</span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> Pendente
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Atenção
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-600" /> Crítico
          </span>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        data-testid="excel-grid-scroll"
        className="excel-scroll relative max-h-[68dvh] overflow-auto"
      >
        <table className="w-max min-w-full border-collapse text-xs">
          <thead className="sticky top-0 z-20 shadow-2xs">
            {/* Level 1: Group Headers */}
            <tr>
              {headerGroupsLevel1.map((grp) => (
                <th
                  key={grp.id}
                  colSpan={grp.colSpan}
                  className={cn(
                    "border-b border-r border-slate-700/40 px-2.5 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider whitespace-nowrap",
                    grp.isKeyGroup
                      ? "sticky left-0 z-30 bg-slate-950 text-white"
                      : GROUP_COLOR_CLASSES[grp.slug] ||
                          "bg-slate-800 text-white",
                  )}
                >
                  {grp.name}
                </th>
              ))}
            </tr>

            {/* Level 2: Column Headers */}
            <tr className="bg-slate-100">
              {columns.map((col) => {
                const isKey = col.kind === "KEY";
                const isCalc = col.kind === "CALCULATED";
                const isYoy = col.kind === "REFERENCE_YOY";
                const isCfg = col.kind === "CONFIG";
                const isInput = col.kind === "INPUT";

                return (
                  <th
                    key={col.key}
                    style={{
                      minWidth: isKey ? 118 : 156,
                      maxWidth: isKey ? 118 : 196,
                    }}
                    title={`${col.col_letter_2026}: ${col.header} (${col.kind})`}
                    className={cn(
                      "border-b border-r border-slate-300 px-2.5 py-2 text-left align-top font-semibold text-slate-800",
                      isKey &&
                        "sticky left-0 z-30 bg-slate-200 text-slate-950 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.2)]",
                      !isKey && isInput && "bg-white",
                      !isKey && !isInput && "bg-slate-100 text-slate-600",
                    )}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="line-clamp-2 leading-tight text-[11px]">
                        {col.header}
                      </span>
                      {isCalc ? (
                        <span
                          title="Coluna calculada automaticamente (edição bloqueada)"
                          className="shrink-0 rounded bg-slate-200 p-0.5 text-slate-600"
                        >
                          <Calculator className="h-3 w-3" />
                        </span>
                      ) : isYoy ? (
                        <span
                          title="Média ano anterior (YoY)"
                          className="shrink-0 rounded bg-indigo-100 p-0.5 text-indigo-700"
                        >
                          <History className="h-3 w-3" />
                        </span>
                      ) : isCfg ? (
                        <span
                          title="Parâmetro configurado no catálogo"
                          className="shrink-0 rounded bg-slate-200 p-0.5 text-slate-600"
                        >
                          <Sliders className="h-3 w-3" />
                        </span>
                      ) : isInput ? (
                        <span className="shrink-0 rounded bg-sky-50 px-1 text-[9px] font-bold text-sky-700">
                          IN
                        </span>
                      ) : null}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {tableRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="p-8 text-center text-sm text-slate-500"
                >
                  Nenhuma linha encontrada para os filtros aplicados.
                </td>
              </tr>
            ) : (
              <>
                {paddingTop > 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length}
                      style={{ height: `${paddingTop}px` }}
                    />
                  </tr>
                ) : null}

                {virtualRows.map((vRow) => {
                  const row = tableRows[vRow.index];
                  const original = row.original;

                  return (
                    <tr
                      key={row.id}
                      data-index={vRow.index}
                      data-reading-date={original.reading_date}
                      className="group hover:bg-sky-50/40"
                    >
                      {row.getVisibleCells().map((tableCell) => {
                        const col = colByKey.get(tableCell.column.id)!;
                        const isKey = col.kind === "KEY";
                        const isInput = col.kind === "INPUT";
                        const cellDto = original.cells[col.key];
                        const isEmptyInput =
                          isInput &&
                          (!cellDto ||
                            cellDto.value === null ||
                            cellDto.value === undefined);
                        const canInteract =
                          isInput &&
                          (Boolean(cellDto?.reading_id) ||
                            (isManager && Boolean(col.meter_code)));

                        const alertBg =
                          cellDto?.alert_severity === "critical"
                            ? "bg-rose-100/90 text-rose-950 font-bold"
                            : cellDto?.alert_severity === "warning" ||
                                cellDto?.is_anomaly
                              ? "bg-amber-100/80 text-amber-950 font-semibold"
                              : cellDto?.status === "pending_review"
                                ? "bg-sky-50/70 ring-1 ring-inset ring-sky-300"
                                : "";

                        return (
                          <td
                            key={tableCell.id}
                            data-col-kind={col.kind}
                            data-col-key={col.key}
                            data-reading-date={original.reading_date}
                            data-cell-empty={String(isEmptyInput)}
                            data-editable={String(isInput && isManager)}
                            onClick={(e) => {
                              if (!canInteract) return;
                              if (
                                editingKey ===
                                `${original.reading_date}:${col.key}`
                              ) {
                                return;
                              }
                              if (quickEditMode && isManager && col.meter_code) {
                                if (clickTimerRef.current) {
                                  clearTimeout(clickTimerRef.current);
                                  clickTimerRef.current = null;
                                }
                                startInlineEdit(
                                  original.reading_date,
                                  cellDto,
                                  col,
                                );
                                return;
                              }
                              if (clickTimerRef.current) {
                                clearTimeout(clickTimerRef.current);
                                clickTimerRef.current = null;
                              }
                              if (e.detail >= 2) {
                                return;
                              }
                              clickTimerRef.current = setTimeout(() => {
                                clickTimerRef.current = null;
                                onSelectCell(original.reading_date, cellDto, col);
                              }, 220);
                            }}
                            onDoubleClick={() => {
                              if (clickTimerRef.current) {
                                clearTimeout(clickTimerRef.current);
                                clickTimerRef.current = null;
                              }
                              if (!isManager || !isInput || !col.meter_code) {
                                return;
                              }
                              startInlineEdit(
                                original.reading_date,
                                cellDto,
                                col,
                              );
                            }}
                            title={
                              !isInput && !isKey
                                ? "Célula calculada/referência — edição bloqueada"
                                : isEmptyInput && isManager
                                  ? "Clique para lançar ou duplo-clique para editar inline"
                                  : canInteract
                                    ? "Clique para inspecionar foto/OCR ou duplo-clique para editar"
                                    : undefined
                            }
                            className={cn(
                              "group/cell h-9 border-b border-r border-slate-200 px-2.5 py-1.5 whitespace-nowrap",
                              isKey &&
                                "sticky left-0 z-10 bg-slate-50 group-hover:bg-sky-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]",
                              !isKey && isInput && !isEmptyInput && "bg-white",
                              !isKey &&
                                isEmptyInput &&
                                "bg-slate-50/40 hover:bg-sky-50/80",
                              !isKey &&
                                !isInput &&
                                "bg-slate-100/85 text-slate-700 select-none cursor-default",
                              canInteract &&
                                "cursor-pointer hover:bg-sky-100/60",
                              alertBg,
                            )}
                          >
                            <div className="flex items-center gap-1">
                              {!isKey && !isInput ? (
                                <Lock
                                  className="h-2.5 w-2.5 shrink-0 text-slate-300"
                                  aria-hidden="true"
                                />
                              ) : null}
                              <div className="min-w-0 flex-1">
                                {flexRender(
                                  tableCell.column.columnDef.cell,
                                  tableCell.getContext(),
                                )}
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {paddingBottom > 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length}
                      style={{ height: `${paddingBottom}px` }}
                    />
                  </tr>
                ) : null}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
