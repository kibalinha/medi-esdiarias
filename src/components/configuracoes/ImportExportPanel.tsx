"use client";

import * as React from "react";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import type { ImportXlsxResponse } from "@/types/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function ImportExportPanel({ onImported }: { onImported: () => void }) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ImportXlsxResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function runImport(dryRun: boolean) {
    if (!selectedFile) {
      setError("Selecione o arquivo .xlsx antes de importar.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("dry_run", dryRun ? "true" : "false");

      const res = await fetch("/api/import/xlsx", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(
          err?.error || `Erro HTTP ${res.status} ao importar planilha.`,
        );
      }
      const data: ImportXlsxResponse = await res.json();
      setResult(data);
      if (!dryRun) {
        onImported();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha na importação XLSX.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          Importação e Exportação Histórica (XLSX)
        </h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setSelectedFile(f);
              setResult(null);
              setError(null);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            {selectedFile ? selectedFile.name : "Selecionar arquivo .xlsx"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            disabled={!selectedFile || busy}
            onClick={() => void runImport(true)}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Simular (Dry-Run)
          </Button>

          <Button
            size="sm"
            disabled={!selectedFile || busy}
            onClick={() => void runImport(false)}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Importar para o Banco
          </Button>

          <div className="ml-auto flex gap-2">
            <a
              href="/api/export/xlsx"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar XLSX Completo
            </a>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {error}
          </div>
        ) : null}

        {result ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
            <p className="font-semibold text-slate-900">
              {result.dry_run
                ? "Prévia de Importação (Dry-Run):"
                : "Importação Concluída:"}
            </p>
            <p className="text-slate-700">
              Abas: <strong>{result.sheets_processed.join(", ")}</strong> &bull;
              Linhas lidas: <strong>{result.total_rows_read}</strong> &bull;
              Leituras: <strong>{result.total_readings_imported}</strong> &bull;
              Viradas detectadas: <strong>{result.rollovers_detected}</strong>
            </p>
            {result.warnings.length > 0 ? (
              <ul className="list-disc pl-4 text-amber-800">
                {result.warnings.slice(0, 5).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
